// ZerOS 应用商店
// 提供应用浏览、搜索、下载等功能
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';

    const STORE = {
        pid: null,
        window: null,
        windowId: null,
        _timers: [],
        _eventHandlers: [],
        _selectedApp: null,
        _apps: [],
        _selectedFolder: null,

        _getText: function(key, fallback) {
            if (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.getText === 'function') {
                const value = LanguagesExpansion.getText(key);
                if (value && value !== key) return value;
            }
            return fallback || key;
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._upid = initArgs && initArgs.upid;
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            this.window = document.createElement('div');
            this.window.className = 'store-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 1100px;
                height: 700px;
                min-width: 900px;
                min-height: 500px;
                max-width: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                background: var(--theme-background, #1a1a2e);
            `;

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('store');
                }

                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('STORE_TITLE', '应用商店'),
                    icon: icon,
                    onClose: () => {}
                });

                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            const content = this._createContent();
            this.window.appendChild(content);
            guiContainer.appendChild(this.window);

            this._loadApps();
        },

        _createContent: function() {
            const container = document.createElement('div');
            container.className = 'store-content';
            container.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            const header = this._createHeader();
            container.appendChild(header);

            const main = document.createElement('div');
            main.className = 'store-main';
            main.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
            `;

            const listPanel = document.createElement('div');
            listPanel.className = 'store-list-panel';
            listPanel.style.cssText = `
                width: 55%;
                min-width: 400px;
                overflow-y: auto;
                padding: 20px;
                border-right: 1px solid var(--theme-border, rgba(139, 92, 246, 0.15));
            `;
            this._appListContainer = listPanel;
            main.appendChild(listPanel);

            const detailPanel = document.createElement('div');
            detailPanel.className = 'store-detail-panel';
            detailPanel.style.cssText = `
                width: 45%;
                min-width: 350px;
                overflow-y: auto;
                padding: 24px;
                background: var(--theme-background-elevated, rgba(30, 30, 50, 0.5));
            `;
            this._detailContainer = detailPanel;
            this._showWelcomeDetail();
            main.appendChild(detailPanel);

            container.appendChild(main);

            return container;
        },

        _createHeader: function() {
            const header = document.createElement('div');
            header.className = 'store-header';
            header.style.cssText = `
                padding: 16px 20px;
                background: var(--theme-background-elevated, rgba(30, 30, 50, 0.95));
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.2));
                display: flex;
                align-items: center;
                gap: 20px;
            `;

            const logo = document.createElement('div');
            logo.className = 'store-logo';
            logo.style.cssText = `
                font-size: 24px;
                font-weight: bold;
                color: #0078D4;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            logo.innerHTML = `
                <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
                    <path d="M32 12L12 22V42L32 52L52 42V22L32 12Z" fill="#0078D4"/>
                    <path d="M32 18L18 25V39L32 46L46 39V25L32 18Z" fill="white"/>
                    <circle cx="32" cy="32" r="6" fill="#0078D4"/>
                </svg>
                <span>ZerOS Store</span>
            `;
            header.appendChild(logo);

            const searchBox = document.createElement('div');
            searchBox.className = 'store-search';
            searchBox.style.cssText = `
                flex: 1;
                max-width: 500px;
                position: relative;
            `;

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'store-search-input';
            searchInput.placeholder = this._getText('STORE_SEARCH', '搜索应用...');
            searchInput.style.cssText = `
                width: 100%;
                padding: 10px 16px 10px 44px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: 8px;
                background: var(--theme-background, #16213e);
                color: var(--theme-text, #e0e0e0);
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            `;
            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = '#0078D4';
                searchInput.style.boxShadow = '0 0 0 3px rgba(0, 120, 212, 0.2)';
            });
            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = '';
                searchInput.style.boxShadow = 'none';
            });
            searchInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    await this._searchApps(searchInput.value);
                }
            });
            this._searchInput = searchInput;

            const searchIcon = document.createElement('div');
            searchIcon.style.cssText = `
                position: absolute;
                left: 14px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--theme-text-muted, #888);
                pointer-events: none;
            `;
            searchIcon.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
            `;
            searchBox.appendChild(searchIcon);
            searchBox.appendChild(searchInput);
            header.appendChild(searchBox);

            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'store-refresh-btn';
            refreshBtn.title = this._getText('STORE_REFRESH', '刷新');
            refreshBtn.style.cssText = `
                padding: 10px 16px;
                border: none;
                border-radius: 8px;
                background: var(--theme-primary, #0078D4);
                color: white;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: background 0.2s;
            `;
            refreshBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                <span>${this._getText('STORE_REFRESH', '刷新')}</span>
            `;
            refreshBtn.addEventListener('click', () => this._loadApps());
            header.appendChild(refreshBtn);

            return header;
        },

        _createAppCard: function(app) {
            const card = document.createElement('div');
            card.className = 'store-app-card';
            card.dataset.id = app.id;
            card.style.cssText = `
                padding: 16px;
                border-radius: 12px;
                background: var(--theme-background-elevated, rgba(30, 30, 50, 0.6));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.1));
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                gap: 16px;
                align-items: center;
            `;

            if (this._selectedApp && this._selectedApp.id === app.id) {
                card.style.borderColor = '#0078D4';
                card.style.background = 'rgba(0, 120, 212, 0.1)';
            }

            card.addEventListener('mouseenter', () => {
                if (!this._selectedApp || this._selectedApp.id !== app.id) {
                    card.style.borderColor = 'rgba(0, 120, 212, 0.5)';
                    card.style.background = 'rgba(0, 120, 212, 0.05)';
                }
            });
            card.addEventListener('mouseleave', () => {
                if (!this._selectedApp || this._selectedApp.id !== app.id) {
                    card.style.borderColor = '';
                    card.style.background = '';
                }
            });

            const icon = document.createElement('div');
            icon.style.cssText = `
                width: 64px;
                height: 64px;
                border-radius: 12px;
                overflow: hidden;
                background: linear-gradient(135deg, #0078D4, #00bcf2);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            `;
            if (app.iconUrl) {
                icon.innerHTML = `<img src="${app.iconUrl}" alt="${app.name}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                icon.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                `;
            }
            card.appendChild(icon);

            const info = document.createElement('div');
            info.style.cssText = `
                flex: 1;
                min-width: 0;
            `;

            const name = document.createElement('div');
            name.textContent = app.name;
            name.style.cssText = `
                font-size: 15px;
                font-weight: 600;
                color: var(--theme-text, #e0e0e0);
                margin-bottom: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            info.appendChild(name);

            const author = document.createElement('div');
            author.textContent = app.author || this._getText('STORE_AUTHOR', '作者');
            author.style.cssText = `
                font-size: 12px;
                color: var(--theme-text-muted, #888);
                margin-bottom: 6px;
            `;
            info.appendChild(author);

            const meta = document.createElement('div');
            meta.style.cssText = `
                display: flex;
                gap: 12px;
                font-size: 11px;
                color: var(--theme-text-muted, #666);
            `;
            meta.innerHTML = `
                <span>v${app.version || '1.0.0'}</span>
                <span>⬇️ ${this._formatNumber(app.downloadCount || 0)}</span>
            `;
            info.appendChild(meta);

            card.appendChild(info);

            card.addEventListener('click', () => this._selectApp(app));

            return card;
        },

        _showWelcomeDetail: function() {
            if (!this._detailContainer) return;

            this._detailContainer.innerHTML = '';

            const welcome = document.createElement('div');
            welcome.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: var(--theme-text-muted, #888);
                text-align: center;
                padding: 40px;
            `;
            welcome.innerHTML = `
                <svg width="80" height="80" viewBox="0 0 64 64" fill="none" style="margin-bottom: 20px; opacity: 0.5;">
                    <path d="M32 12L12 22V42L32 52L52 42V22L32 12Z" fill="#0078D4"/>
                    <path d="M32 18L18 25V39L32 46L46 39V25L32 18Z" fill="white"/>
                    <circle cx="32" cy="32" r="8" fill="#0078D4"/>
                </svg>
                <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px; color: var(--theme-text, #ccc);">欢迎使用 ZerOS 应用商店</div>
                <div style="font-size: 14px;">选择一个应用查看详情</div>
            `;
            this._detailContainer.appendChild(welcome);
        },

        _showAppDetail: async function(app) {
            if (!this._detailContainer) return;

            this._detailContainer.innerHTML = '';
            this._detailContainer.appendChild(this._createLoading());

            try {
                const baseUrl = 'http://localhost:8088';
                const response = await fetch(`${baseUrl}/api/application/${app.id}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json();

                if (result.code === 200 && result.data) {
                    app = result.data;
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `获取应用详情失败: ${error.message}`, error);
                }
            }

            this._detailContainer.innerHTML = '';

            const detail = document.createElement('div');
            detail.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 20px;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                gap: 20px;
                align-items: flex-start;
            `;

            const icon = document.createElement('div');
            icon.style.cssText = `
                width: 100px;
                height: 100px;
                border-radius: 20px;
                overflow: hidden;
                background: linear-gradient(135deg, #0078D4, #00bcf2);
                flex-shrink: 0;
            `;
            if (app.iconUrl) {
                icon.innerHTML = `<img src="${app.iconUrl}" alt="${app.name}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                icon.innerHTML = `
                    <svg width="50" height="50" viewBox="0 0 24 24" fill="white" style="margin:25px;">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                `;
            }
            header.appendChild(icon);

            const info = document.createElement('div');
            info.style.cssText = `
                flex: 1;
                min-width: 0;
            `;

            const name = document.createElement('div');
            name.textContent = app.name;
            name.style.cssText = `
                font-size: 22px;
                font-weight: 600;
                color: var(--theme-text, #e0e0e0);
                margin-bottom: 6px;
            `;
            info.appendChild(name);

            const author = document.createElement('div');
            author.innerHTML = `<span style="color: var(--theme-text-muted, #888);">${this._getText('STORE_AUTHOR', '作者')}: </span><span style="color: var(--theme-text, #ccc);">${app.author || '-'}</span>`;
            author.style.cssText = `font-size: 14px; margin-bottom: 4px;`;
            info.appendChild(author);

            const version = document.createElement('div');
            version.innerHTML = `<span style="color: var(--theme-text-muted, #888);">${this._getText('STORE_VERSION', '版本')}: </span><span style="color: var(--theme-text, #ccc);">${app.version || '1.0.0'}</span>`;
            version.style.cssText = `font-size: 14px; margin-bottom: 4px;`;
            info.appendChild(version);

            const copyright = document.createElement('div');
            copyright.textContent = app.copyright || '';
            copyright.style.cssText = `font-size: 12px; color: var(--theme-text-muted, #666); margin-bottom: 8px;`;
            if (app.copyright) info.appendChild(copyright);

            const stats = document.createElement('div');
            stats.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                gap: 16px;
                font-size: 13px;
                color: var(--theme-text-muted, #888);
            `;
            const createdAt = app.createdAt ? this._formatDate(app.createdAt) : '';
            const isActive = app.isActive !== false;
            stats.innerHTML = `
                <span>⬇️ ${this._formatNumber(app.downloadCount || 0)} 次下载</span>
                <span>📦 ${this._formatSize(app.packageSize || 0)}</span>
                ${createdAt ? `<span>📅 ${createdAt}</span>` : ''}
                <span style="color: ${isActive ? '#4caf50' : '#f44336'};">● ${isActive ? '已激活' : '未激活'}</span>
            `;
            info.appendChild(stats);

            header.appendChild(info);
            detail.appendChild(header);

            const screenshotUrls = app.screenshotUrls;
            const screenshotsArray = Array.isArray(screenshotUrls) ? screenshotUrls : (typeof screenshotUrls === 'string' && screenshotUrls ? [screenshotUrls] : []);
            if (screenshotsArray.length > 0) {
                const screenshotsTitle = document.createElement('div');
                screenshotsTitle.textContent = this._getText('STORE_SCREENSHOTS', '截图预览');
                screenshotsTitle.style.cssText = `
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--theme-text, #ccc);
                    margin-top: 10px;
                `;
                detail.appendChild(screenshotsTitle);

                const screenshotGrid = document.createElement('div');
                screenshotGrid.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    gap: 10px;
                `;
                screenshotsArray.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = 'Screenshot';
                    img.style.cssText = `
                        width: 100%;
                        height: 80px;
                        object-fit: cover;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: transform 0.2s;
                    `;
                    img.addEventListener('mouseenter', () => img.style.transform = 'scale(1.02)');
                    img.addEventListener('mouseleave', () => img.style.transform = '');
                    screenshotGrid.appendChild(img);
                });
                detail.appendChild(screenshotGrid);
            }

            const descTitle = document.createElement('div');
            descTitle.textContent = this._getText('STORE_INTRO', '应用介绍');
            descTitle.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #ccc);
                margin-top: 10px;
            `;
            detail.appendChild(descTitle);

            const desc = document.createElement('div');
            desc.textContent = app.description || this._getText('STORE_NO_DESC', '暂无描述');
            desc.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-muted, #aaa);
                line-height: 1.6;
                padding: 12px;
                background: var(--theme-background, rgba(0,0,0,0.2));
                border-radius: 8px;
            `;
            detail.appendChild(desc);

            const actionBar = document.createElement('div');
            actionBar.style.cssText = `
                display: flex;
                gap: 12px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid var(--theme-border, rgba(139, 92, 246, 0.15));
            `;

            const installState = this._checkAppInstallState(app);
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'store-download-btn';
            downloadBtn.dataset.appId = app.id;
            downloadBtn.style.cssText = `
                flex: 1;
                padding: 14px 24px;
                border: none;
                border-radius: 10px;
                background: linear-gradient(135deg, #0078D4, #00a0e8);
                color: white;
                font-size: 15px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            `;
            
            const updateDownloadButtonState = () => {
                const state = this._checkAppInstallState(app);
                if (state === 'not_installed') {
                    downloadBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        <span>下载应用</span>
                    `;
                    downloadBtn.style.background = 'linear-gradient(135deg, #0078D4, #00a0e8)';
                } else if (state === 'update_available') {
                    downloadBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                        </svg>
                        <span>更新版本</span>
                    `;
                    downloadBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
                } else {
                    downloadBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>已安装</span>
                    `;
                    downloadBtn.style.background = 'linear-gradient(135deg, #6c757d, #495057)';
                    downloadBtn.disabled = true;
                }
            };
            
            downloadBtn.addEventListener('mouseenter', () => {
                if (!downloadBtn.disabled) {
                    downloadBtn.style.transform = 'translateY(-2px)';
                    downloadBtn.style.boxShadow = '0 4px 16px rgba(0, 120, 212, 0.4)';
                }
            });
            downloadBtn.addEventListener('mouseleave', () => {
                downloadBtn.style.transform = '';
                downloadBtn.style.boxShadow = '';
            });
            downloadBtn.addEventListener('click', async () => {
                const state = this._checkAppInstallState(app);
                
                if (state === 'update_available') {
                    const confirmed = await this._showConfirmDialog(
                        `检测到新版本，是否先卸载当前版本再安装新版本？`,
                        '更新应用',
                        'info'
                    );
                    if (!confirmed) return;
                    
                    const uninstalled = await this._uninstallApp(app);
                    if (!uninstalled) {
                        await this._showAlertDialog('卸载失败，无法继续更新', '错误', 'error');
                        return;
                    }
                }
                
                const progressContainer = detail.querySelector('.store-progress-container');
                if (progressContainer) {
                    progressContainer.style.display = 'block';
                }
                downloadBtn.disabled = true;
                downloadBtn.style.opacity = '0.7';
                downloadBtn.style.cursor = 'not-allowed';
                this._updateDownloadButton(downloadBtn, 'downloading', 0);
                
                try {
                    await this._downloadApp(app, (progress) => {
                        this._updateDownloadButton(downloadBtn, 'downloading', progress);
                    });
                    this._updateDownloadButton(downloadBtn, 'completed');
                    updateDownloadButtonState();
                } catch (error) {
                    this._updateDownloadButton(downloadBtn, 'error', error.message);
                }
                
                setTimeout(() => {
                    downloadBtn.disabled = false;
                    downloadBtn.style.opacity = '1';
                    downloadBtn.style.cursor = 'pointer';
                    this._updateDownloadButton(downloadBtn, 'idle');
                    updateDownloadButtonState();
                    if (progressContainer) {
                        progressContainer.style.display = 'none';
                        const progressBar = progressContainer.querySelector('.store-progress-bar');
                        if (progressBar) {
                            progressBar.style.width = '0%';
                        }
                    }
                }, 3000);
            });
            
            updateDownloadButtonState();
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'store-delete-btn';
            deleteBtn.style.cssText = `
                padding: 14px 20px;
                border: none;
                border-radius: 10px;
                background: linear-gradient(135deg, #dc3545, #c82333);
                color: white;
                font-size: 15px;
                font-weight: 500;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            `;
            deleteBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                <span>卸载</span>
            `;
            deleteBtn.addEventListener('mouseenter', () => {
                deleteBtn.style.transform = 'translateY(-2px)';
                deleteBtn.style.boxShadow = '0 4px 16px rgba(220, 53, 69, 0.4)';
            });
            deleteBtn.addEventListener('mouseleave', () => {
                deleteBtn.style.transform = '';
                deleteBtn.style.boxShadow = '';
            });
            deleteBtn.addEventListener('click', async () => {
                const confirmed = await this._showConfirmDialog(
                    `确定要卸载 ${app.name} 吗？`,
                    '卸载应用',
                    'warning'
                );
                if (!confirmed) return;
                
                const result = await this._uninstallApp(app);
                if (result) {
                    updateDownloadButtonState();
                    updateDeleteButtonState();
                }
            });
            
            const updateDeleteButtonState = () => {
                const state = this._checkAppInstallState(app);
                if (state === 'installed' || state === 'update_available') {
                    deleteBtn.style.display = 'flex';
                } else {
                    deleteBtn.style.display = 'none';
                }
            };
            
            updateDeleteButtonState();
            actionBar.appendChild(deleteBtn);
            actionBar.appendChild(downloadBtn);

            const progressContainer = document.createElement('div');
            progressContainer.className = 'store-progress-container';
            progressContainer.style.cssText = `
                display: none;
                margin-top: 12px;
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
            `;
            
            const progressLabel = document.createElement('div');
            progressLabel.className = 'store-progress-label';
            progressLabel.style.cssText = `
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
            `;
            progressLabel.innerHTML = `<span>下载进度</span><span class="store-progress-percent">0%</span>`;
            progressContainer.appendChild(progressLabel);
            
            const progressBarBg = document.createElement('div');
            progressBarBg.className = 'store-progress-bar-bg';
            progressBarBg.style.cssText = `
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                overflow: hidden;
            `;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'store-progress-bar';
            progressBar.style.cssText = `
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #00a0e8, #0078D4);
                border-radius: 3px;
                transition: width 0.3s ease;
            `;
            progressBarBg.appendChild(progressBar);
            progressContainer.appendChild(progressBarBg);
            
            actionBar.appendChild(progressContainer);

            detail.appendChild(actionBar);

            this._detailContainer.appendChild(detail);
        },

        _selectApp: function(app) {
            this._selectedApp = app;
            this._renderAppList();
            this._showAppDetail(app);
        },

        _renderAppList: function() {
            if (!this._appListContainer || !this._apps) return;

            this._appListContainer.innerHTML = '';

            if (this._apps.length === 0) {
                this._appListContainer.appendChild(this._createEmpty(this._getText('STORE_NO_APPS', '暂无应用')));
                return;
            }

            const grid = document.createElement('div');
            grid.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;

            this._apps.forEach(app => {
                const card = this._createAppCard(app);
                grid.appendChild(card);
            });

            this._appListContainer.appendChild(grid);
        },

        _createLoading: function() {
            const loading = document.createElement('div');
            loading.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 60px 20px;
                gap: 16px;
            `;

            const spinner = document.createElement('div');
            spinner.style.cssText = `
                width: 40px;
                height: 40px;
                border: 3px solid var(--theme-border, rgba(139, 92, 246, 0.2));
                border-top-color: #0078D4;
                border-radius: 50%;
                animation: store-spin 1s linear infinite;
            `;

            const style = document.createElement('style');
            style.textContent = `
                @keyframes store-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            if (!document.querySelector('#store-spin-style')) {
                style.id = 'store-spin-style';
                document.head.appendChild(style);
            }

            const text = document.createElement('div');
            text.textContent = this._getText('STORE_LOADING', '加载中...');
            text.style.cssText = `
                color: var(--theme-text-muted, #888);
                font-size: 14px;
            `;

            loading.appendChild(spinner);
            loading.appendChild(text);

            return loading;
        },

        _createEmpty: function(message) {
            const empty = document.createElement('div');
            empty.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 60px 20px;
                gap: 16px;
            `;

            empty.innerHTML = `
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--theme-text-muted, #666)" stroke-width="1.5">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <div style="color: var(--theme-text-muted, #888); font-size: 14px;">${message || this._getText('STORE_NO_APPS', '暂无应用')}</div>
            `;

            return empty;
        },

        _loadApps: async function() {
            if (!this._appListContainer) return;

            this._appListContainer.innerHTML = '';
            this._appListContainer.appendChild(this._createLoading());

            try {
                const baseUrl = 'http://localhost:8088';
                const response = await fetch(`${baseUrl}/api/application/list`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json();

                if (result.code === 200 && result.data) {
                    this._apps = result.data;
                    this._selectedApp = null;
                    this._renderAppList();
                    this._showWelcomeDetail();
                } else {
                    this._appListContainer.innerHTML = '';
                    this._appListContainer.appendChild(this._createEmpty(result.msg || '加载失败'));
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `加载应用列表失败: ${error.message}`, error);
                }
                this._appListContainer.innerHTML = '';
                this._appListContainer.appendChild(this._createEmpty(this._getText('STORE_CONNECT_ERROR', '无法连接到服务器')));
            }
        },

        _searchApps: async function(keyword) {
            if (!this._appListContainer) return;

            if (!keyword || keyword.trim() === '') {
                await this._loadApps();
                return;
            }

            this._appListContainer.innerHTML = '';
            this._appListContainer.appendChild(this._createLoading());

            try {
                const baseUrl = 'http://localhost:8088';
                const response = await fetch(`${baseUrl}/api/application/search?keyword=${encodeURIComponent(keyword)}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json();

                if (result.code === 200 && result.data) {
                    this._apps = result.data;
                    this._selectedApp = null;
                    this._renderAppList();
                    this._showWelcomeDetail();
                } else {
                    this._appListContainer.innerHTML = '';
                    this._appListContainer.appendChild(this._createEmpty(`未找到与 "${keyword}" 相关的应用`));
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `搜索应用失败: ${error.message}`, error);
                }
                this._appListContainer.innerHTML = '';
                this._appListContainer.appendChild(this._createEmpty(this._getText('STORE_CONNECT_ERROR', '搜索失败')));
            }
        },

        _downloadApp: async function(app, onProgress) {
            try {
                const baseUrl = 'http://localhost:8088';
                const cacheDir = 'D:/cache/store';
                const fileName = app.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') + '.zom';

                if (onProgress) onProgress(5);

                await NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '正在获取下载链接',
                    content: `正在获取 ${app.name} 的下载链接...`,
                    duration: 3000
                });

                if (onProgress) onProgress(10);

                const downloadResponse = await fetch(`${baseUrl}/api/application/${app.id}/download`, {
                    method: 'POST'
                });

                if (!downloadResponse.ok) {
                    throw new Error(`HTTP ${downloadResponse.status}`);
                }

                const downloadResult = await downloadResponse.json();

                if (downloadResult.code !== 200 || !downloadResult.data) {
                    throw new Error(downloadResult.msg || '获取下载链接失败');
                }

                const packageUrl = downloadResult.data;
                const saveDir = cacheDir + '/';

                if (onProgress) onProgress(20);

                await NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '正在下载',
                    content: `正在下载 ${app.name} 到缓存目录...`,
                    duration: 3000
                });

                if (onProgress) onProgress(25);

                const fileResponse = await fetch(packageUrl);
                if (!fileResponse.ok) {
                    throw new Error(`下载文件失败: HTTP ${fileResponse.status}`);
                }

                const contentLength = fileResponse.headers.get('content-length');
                const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
                
                if (onProgress) onProgress(40);

                const blob = await fileResponse.blob();
                
                if (onProgress) onProgress(60);

                const arrayBuffer = await blob.arrayBuffer();
                
                if (onProgress) onProgress(75);

                const base64 = this._arrayBufferToBase64(arrayBuffer);
                
                if (onProgress) onProgress(85);

                const createDirUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                    : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin));
                if (this._upid != null) createDirUrl.searchParams.set('upid', this._upid);
                createDirUrl.searchParams.set('action', 'create_dir');
                createDirUrl.searchParams.set('path', 'D:/');
                createDirUrl.searchParams.set('name', 'cache');

                try {
                    await fetch(createDirUrl.toString(), { method: 'POST' });
                } catch (e) {
                }

                const createStoreDirUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                    : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin));
                if (this._upid != null) createStoreDirUrl.searchParams.set('upid', this._upid);
                createStoreDirUrl.searchParams.set('action', 'create_dir');
                createStoreDirUrl.searchParams.set('path', 'D:/cache');
                createStoreDirUrl.searchParams.set('name', 'store');

                try {
                    await fetch(createStoreDirUrl.toString(), { method: 'POST' });
                } catch (e) {
                }

                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                    : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin));
                if (this._upid != null) url.searchParams.set('upid', this._upid);
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', saveDir);
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('writeMod', 'overwrite');

                const saveResponse = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: base64, isBase64: true })
                });

                const saveResult = await saveResponse.json();

                if (saveResult.status === 'success') {
                    const packagePath = saveDir + fileName;
                    let installSuccess = false;
                    let installError = null;

                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '正在安装',
                            content: `正在安装 ${app.name}...`,
                            duration: 3000
                        });

                        await new Promise(resolve => setTimeout(resolve, 500));

                        let tempAsset = null;
                        try {
                            const baseUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin);
                            const path = (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php';
                            const url = new URL(path, baseUrl);
                            if (this._upid != null) url.searchParams.set('upid', this._upid);
                            url.searchParams.set('action', 'read_file');
                            url.searchParams.set('path', 'D:/bin');
                            url.searchParams.set('fileName', 'zominstall.js');
                            
                            const response = await fetch(url.toString());
                            if (response.ok) {
                                const result = await response.json();
                                if (result.status === 'success') {
                                    const fileContent = result.data?.content || result.data || '';
                                    if (fileContent && typeof fileContent === 'string') {
                                        tempAsset = {
                                            script: fileContent,
                                            styles: [],
                                            icon: null,
                                            metadata: {
                                                name: 'zominstall',
                                                type: 'CLI',
                                                allowMultipleInstances: false
                                            }
                                        };
                                    }
                                }
                            }
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('STORE', `加载 zominstall.js 失败: ${e.message}`);
                            }
                        }

                        if (!tempAsset) {
                            throw new Error('无法加载安装程序');
                        }

                        if (onProgress) onProgress(90);

                        await ProcessManager.startProgram('zominstall', {
                            args: [packagePath],
                            tempAsset: tempAsset
                        });

                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        if (onProgress) onProgress(95);
                        
                        installSuccess = true;

                    } catch (installErr) {
                        installError = installErr;
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('STORE', `安装失败: ${installErr.message}`, installErr);
                        }
                    }

                    if (installSuccess) {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '安装完成',
                            content: `${app.name} 安装完成`,
                            duration: 5000
                        });
                    } else {
                        await this._showAlertDialog(
                            `安装失败: ${installError ? installError.message : '未知错误'}`,
                            '安装错误',
                            'error'
                        );
                    }

                    if (onProgress) onProgress(100);

                    const deleteUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                        : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin));
                    if (this._upid != null) deleteUrl.searchParams.set('upid', this._upid);
                    deleteUrl.searchParams.set('action', 'delete_file');
                    deleteUrl.searchParams.set('path', 'D:/cache/store');
                    deleteUrl.searchParams.set('fileName', fileName);

                    try {
                        await fetch(deleteUrl.toString(), { method: 'POST' });
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('STORE', `已删除安装包: ${fileName}`);
                        }
                    } catch (deleteError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('STORE', `删除安装包失败: ${deleteError.message}`);
                        }
                    }
                } else {
                    throw new Error(saveResult.message || '保存文件失败');
                }
            } catch (error) {
                const deleteUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                    : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php', (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin));
                if (this._upid != null) deleteUrl.searchParams.set('upid', this._upid);
                deleteUrl.searchParams.set('action', 'delete_file');
                deleteUrl.searchParams.set('path', 'D:/cache/store');
                deleteUrl.searchParams.set('fileName', fileName);

                try {
                    await fetch(deleteUrl.toString(), { method: 'POST' });
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('STORE', `下载失败，已删除残留安装包: ${fileName}`);
                    }
                } catch (deleteError) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('STORE', `删除残留安装包失败: ${deleteError.message}`);
                    }
                }

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `下载应用失败: ${error.message}`, error);
                }
                await this._showAlertDialog(
                    `下载失败: ${error.message}`,
                    '错误',
                    'error'
                );
            }
        },

        _selectSaveFolder: function() {
            return new Promise((resolve) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        resolve(null);
                    }
                }, 5 * 60 * 1000);

                ProcessManager.startProgram('filemanager', {
                    args: ['D:/'],
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
        },

        _normalizePath: function(path) {
            if (!path) return '';
            path = path.replace(/\\/g, '/');
            path = path.replace(/\/+/g, '/');
            if (path.endsWith('/')) {
                path = path.slice(0, -1);
            }
            return path;
        },

        _showConfirmDialog: function(message, title, type = 'info') {
            return new Promise((resolve) => {
                const guiContainer = ProcessManager.getGUIContainer 
                    ? ProcessManager.getGUIContainer() 
                    : document.getElementById('gui-container') || document.body;
                
                const dialogWindow = document.createElement('div');
                dialogWindow.className = 'store-dialog-window zos-gui-window';
                dialogWindow.style.cssText = `
                    width: 420px;
                    min-height: 180px;
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 100001;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                `;
                
                const titleBar = document.createElement('div');
                titleBar.style.cssText = `
                    height: 40px;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                    padding: 0 16px;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                    background: rgba(30, 35, 50, 0.95);
                `;
                
                const titleText = document.createElement('span');
                titleText.textContent = title || '确认';
                titleText.style.cssText = `
                    color: rgba(215, 224, 221, 0.95);
                    font-size: 14px;
                    font-weight: 500;
                `;
                titleBar.appendChild(titleText);
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.style.cssText = `
                    margin-left: auto;
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: transparent;
                    color: rgba(215, 224, 221, 0.6);
                    font-size: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                `;
                closeBtn.addEventListener('mouseenter', () => {
                    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                });
                closeBtn.addEventListener('mouseleave', () => {
                    closeBtn.style.background = 'transparent';
                });
                closeBtn.addEventListener('click', () => {
                    dialogWindow.remove();
                    resolve(false);
                });
                titleBar.appendChild(closeBtn);
                dialogWindow.appendChild(titleBar);
                
                const contentArea = document.createElement('div');
                contentArea.style.cssText = `
                    flex: 1;
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                const messageDiv = document.createElement('div');
                messageDiv.textContent = message;
                messageDiv.style.cssText = `
                    color: rgba(215, 224, 221, 0.85);
                    font-size: 14px;
                    text-align: center;
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-break: break-word;
                `;
                contentArea.appendChild(messageDiv);
                dialogWindow.appendChild(contentArea);
                
                const buttonBar = document.createElement('div');
                buttonBar.style.cssText = `
                    height: 56px;
                    min-height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 24px;
                    gap: 12px;
                    border-top: 1px solid rgba(108, 142, 255, 0.15);
                `;
                
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '取消';
                cancelBtn.style.cssText = `
                    padding: 8px 24px;
                    min-width: 80px;
                    border: 1px solid rgba(108, 142, 255, 0.3);
                    background: rgba(108, 142, 255, 0.1);
                    color: rgba(215, 224, 221, 0.85);
                    font-size: 13px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                cancelBtn.addEventListener('mouseenter', () => {
                    cancelBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                });
                cancelBtn.addEventListener('mouseleave', () => {
                    cancelBtn.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                cancelBtn.addEventListener('click', () => {
                    dialogWindow.remove();
                    resolve(false);
                });
                
                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = '确定';
                confirmBtn.style.cssText = `
                    padding: 8px 24px;
                    min-width: 80px;
                    border: none;
                    background: rgba(108, 142, 255, 0.8);
                    color: white;
                    font-size: 13px;
                    font-weight: 500;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                confirmBtn.addEventListener('mouseenter', () => {
                    confirmBtn.style.background = 'rgba(108, 142, 255, 1)';
                });
                confirmBtn.addEventListener('mouseleave', () => {
                    confirmBtn.style.background = 'rgba(108, 142, 255, 0.8)';
                });
                confirmBtn.addEventListener('click', () => {
                    dialogWindow.remove();
                    resolve(true);
                });
                
                buttonBar.appendChild(cancelBtn);
                buttonBar.appendChild(confirmBtn);
                dialogWindow.appendChild(buttonBar);
                
                guiContainer.appendChild(dialogWindow);
            });
        },

        _showAlertDialog: function(message, title, type = 'info') {
            return new Promise((resolve) => {
                const guiContainer = ProcessManager.getGUIContainer 
                    ? ProcessManager.getGUIContainer() 
                    : document.getElementById('gui-container') || document.body;
                
                const dialogWindow = document.createElement('div');
                dialogWindow.className = 'store-dialog-window zos-gui-window';
                dialogWindow.style.cssText = `
                    width: 420px;
                    min-height: 180px;
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 100001;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                `;
                
                const titleBar = document.createElement('div');
                titleBar.style.cssText = `
                    height: 40px;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                    padding: 0 16px;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                    background: rgba(30, 35, 50, 0.95);
                `;
                
                const titleText = document.createElement('span');
                titleText.textContent = title || '提示';
                titleText.style.cssText = `
                    color: rgba(215, 224, 221, 0.95);
                    font-size: 14px;
                    font-weight: 500;
                `;
                titleBar.appendChild(titleText);
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.style.cssText = `
                    margin-left: auto;
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: transparent;
                    color: rgba(215, 224, 221, 0.6);
                    font-size: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                `;
                closeBtn.addEventListener('mouseenter', () => {
                    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                });
                closeBtn.addEventListener('mouseleave', () => {
                    closeBtn.style.background = 'transparent';
                });
                closeBtn.addEventListener('click', () => {
                    dialogWindow.remove();
                    resolve();
                });
                titleBar.appendChild(closeBtn);
                dialogWindow.appendChild(titleBar);
                
                const contentArea = document.createElement('div');
                contentArea.style.cssText = `
                    flex: 1;
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                const messageDiv = document.createElement('div');
                messageDiv.textContent = message;
                messageDiv.style.cssText = `
                    color: rgba(215, 224, 221, 0.85);
                    font-size: 14px;
                    text-align: center;
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-break: break-word;
                `;
                contentArea.appendChild(messageDiv);
                dialogWindow.appendChild(contentArea);
                
                const buttonBar = document.createElement('div');
                buttonBar.style.cssText = `
                    height: 56px;
                    min-height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 24px;
                    gap: 12px;
                    border-top: 1px solid rgba(108, 142, 255, 0.15);
                `;
                
                const okBtn = document.createElement('button');
                okBtn.textContent = '确定';
                okBtn.style.cssText = `
                    padding: 8px 32px;
                    min-width: 100px;
                    border: none;
                    background: rgba(108, 142, 255, 0.8);
                    color: white;
                    font-size: 13px;
                    font-weight: 500;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                okBtn.addEventListener('mouseenter', () => {
                    okBtn.style.background = 'rgba(108, 142, 255, 1)';
                });
                okBtn.addEventListener('mouseleave', () => {
                    okBtn.style.background = 'rgba(108, 142, 255, 0.8)';
                });
                okBtn.addEventListener('click', () => {
                    dialogWindow.remove();
                    resolve();
                });
                
                buttonBar.appendChild(okBtn);
                dialogWindow.appendChild(buttonBar);
                
                guiContainer.appendChild(dialogWindow);
            });
        },


        _arrayBufferToBase64: function(buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        },

        _updateDownloadButton: function(btn, state, progress = 0) {
            const percentSpan = btn.closest('.store-detail-panel')?.querySelector('.store-progress-percent');
            
            if (state === 'downloading') {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="store-spinner">
                        <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                    </svg>
                    <span>下载中 ${Math.round(progress)}%</span>
                `;
                if (percentSpan) {
                    percentSpan.textContent = `${Math.round(progress)}%`;
                }
                const progressBar = btn.closest('.store-detail-panel')?.querySelector('.store-progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                }
            } else if (state === 'completed') {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>安装完成</span>
                `;
                btn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
                if (percentSpan) {
                    percentSpan.textContent = '100%';
                }
                const progressBar = btn.closest('.store-detail-panel')?.querySelector('.store-progress-bar');
                if (progressBar) {
                    progressBar.style.width = '100%';
                }
            } else if (state === 'error') {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span>下载失败</span>
                `;
                btn.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
            } else {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>下载应用</span>
                `;
                btn.style.background = 'linear-gradient(135deg, #0078D4, #00a0e8)';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        },

        _formatNumber: function(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toString();
        },

        _formatSize: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        _formatDate: function(dateString) {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } catch (e) {
                return dateString;
            }
        },

        _checkAppInstallState: function(app) {
            if (typeof ApplicationAssetManager === 'undefined') {
                return 'not_installed';
            }
            
            try {
                const programInfo = ApplicationAssetManager.getProgramInfo(app.programName || app.name);
                if (!programInfo) {
                    return 'not_installed';
                }
                
                const localVersion = programInfo.metadata?.version;
                const serverVersion = app.version;
                
                if (!localVersion || !serverVersion) {
                    return 'installed';
                }
                
                if (this._compareVersion(localVersion, serverVersion) < 0) {
                    return 'update_available';
                }
                
                return 'installed';
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('STORE', `检查安装状态失败: ${e.message}`);
                }
                return 'not_installed';
            }
        },

        _compareVersion: function(localVer, serverVer) {
            const localParts = localVer.split('.').map(Number);
            const serverParts = serverVer.split('.').map(Number);
            
            for (let i = 0; i < Math.max(localParts.length, serverParts.length); i++) {
                const localNum = localParts[i] || 0;
                const serverNum = serverParts[i] || 0;
                
                if (localNum < serverNum) return -1;
                if (localNum > serverNum) return 1;
            }
            return 0;
        },

        _uninstallApp: async function(app) {
            try {
                const programName = app.programName || app.name;
                
                await NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '正在卸载',
                    content: `正在卸载 ${app.name}...`,
                    duration: 3000
                });

                let tempAsset = null;
                try {
                    const baseUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin);
                    const path = (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php';
                    const url = new URL(path, baseUrl);
                    if (this._upid != null) url.searchParams.set('upid', this._upid);
                    url.searchParams.set('action', 'read_file');
                    url.searchParams.set('path', 'D:/bin');
                    url.searchParams.set('fileName', 'zominstall.js');
                    
                    const response = await fetch(url.toString());
                    if (response.ok) {
                        const result = await response.json();
                        if (result.status === 'success') {
                            const fileContent = result.data?.content || result.data || '';
                            if (fileContent && typeof fileContent === 'string') {
                                tempAsset = {
                                    script: fileContent,
                                    styles: [],
                                    icon: null,
                                    metadata: {
                                        name: 'zominstall',
                                        type: 'CLI',
                                        allowMultipleInstances: false
                                    }
                                };
                            }
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('STORE', `加载 zominstall.js 失败: ${e.message}`);
                    }
                }

                if (!tempAsset) {
                    throw new Error('无法加载卸载程序');
                }

                await ProcessManager.startProgram('zominstall', {
                    args: ['--uninstall', programName],
                    tempAsset: tempAsset
                });

                await new Promise(resolve => setTimeout(resolve, 2000));

                await NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '卸载完成',
                    content: `${app.name} 已卸载`,
                    duration: 5000
                });

                return true;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `卸载应用失败: ${error.message}`, error);
                }
                await this._showAlertDialog(
                    `卸载失败: ${error.message}`,
                    '错误',
                    'error'
                );
                return false;
            }
        },

        __exit__: async function() {
            try {
                if (this.windowId && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.pid);
                }

                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }

                if (this._timers) {
                    this._timers.forEach(timer => clearTimeout(timer));
                    this._timers = null;
                }

                this.window = null;
                this.windowId = null;
                this._appListContainer = null;
                this._detailContainer = null;
                this._apps = null;
                this._selectedFolder = null;
                this._selectedApp = null;

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('STORE', `清理资源失败: ${error.message}`, error);
                }
            }
        },

        __info__: function() {
            return {
                name: 'store',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 应用商店',
                author: 'ZerOS Team',
                copyright: '© 2026 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.APPLICATION_INSTALL,
                    PermissionManager.PERMISSION.APPLICATION_UNINSTALL
                ] : [],
                metadata: {
                    allowMultipleInstances: true,
                    category: 'utility'
                }
            };
        }
    };

    if (typeof window !== 'undefined') {
        window.STORE = STORE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.STORE = STORE;
    }

})(typeof window !== 'undefined' ? window : globalThis);
