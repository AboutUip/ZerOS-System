// ZerOS 主题与动画管理器
// 负责系统主题和GUI风格的切换，以及动画参数的调整
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const THEMEANIMATOR = {
        pid: null,
        window: null,
        currentThemeId: null,
        currentStyleId: null,
        currentAnimationPresetId: null,
        themeChangeUnsubscribe: null,
        styleChangeUnsubscribe: null,
        animationPresetChangeUnsubscribe: null,
        _loadingRandomAnimeBg: false,  // 防止重复请求标志
        
        __init__: async function(pid, initArgs) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', `__init__ 被调用, PID: ${pid}`);
            }
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'themeanimator-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 900px;
                height: 700px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('themeanimator');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '主题与动画管理器',
                    icon: icon,
                    onClose: () => {
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
            const content = document.createElement('div');
            content.className = 'themeanimator-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
                gap: 20px;
            `;
            
            // 创建标签页容器
            const tabsContainer = this._createTabsContainer();
            content.appendChild(tabsContainer);
            
            // 创建内容面板容器
            const panelsContainer = document.createElement('div');
            panelsContainer.className = 'themeanimator-panels';
            panelsContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding-top: 20px;
            `;
            
            // 创建主题管理面板
            const themePanel = this._createThemePanel();
            themePanel.classList.add('active');
            themePanel.style.display = 'flex';
            panelsContainer.appendChild(themePanel);
            
            // 创建风格管理面板
            const stylePanel = this._createStylePanel();
            panelsContainer.appendChild(stylePanel);
            
            // 创建背景图管理面板
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '准备创建背景面板');
            }
            const backgroundPanel = this._createBackgroundPanel();
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '背景面板创建完成', backgroundPanel);
            }
            panelsContainer.appendChild(backgroundPanel);
            
            // 创建动画管理面板
            const animationPanel = this._createAnimationPanel();
            panelsContainer.appendChild(animationPanel);
            
            // 创建锁屏管理面板
            const lockscreenPanel = this._createLockscreenPanel();
            panelsContainer.appendChild(lockscreenPanel);
            
            content.appendChild(panelsContainer);
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 初始化数据
            await this._loadCurrentSettings();
            
            // 监听主题和风格变更
            this._setupListeners();
            
            // 注册本地背景卡片的右键菜单（删除功能）
            this._registerBackgroundContextMenu();
            
            // 注册锁屏背景卡片的右键菜单（删除功能）
            this._registerLockscreenBackgroundContextMenu();
        },
        
        __info__: function() {
            return {
                name: '主题管理器',
                type: 'GUI',
                description: '系统主题与动画的调控与管理',
                version: '1.0.0',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.NETWORK_ACCESS  // 壁纸社区功能需要网络访问
                ] : [],
                metadata: {
                    allowMultipleInstances: false  // 不支持多实例，如果已运行则聚焦现有窗口
                }
            };
        },
        
        __exit__: function(pid, force) {
            // 防止递归调用：如果已经标记为退出中，直接返回
            if (this._exiting) {
                return;
            }
            this._exiting = true;
            
            // 移除监听器（onThemeChange和onStyleChange返回取消函数）
            if (this.themeChangeUnsubscribe && typeof this.themeChangeUnsubscribe === 'function') {
                try {
                    this.themeChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            if (this.styleChangeUnsubscribe && typeof this.styleChangeUnsubscribe === 'function') {
                try {
                    this.styleChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            if (this.animationPresetChangeUnsubscribe && typeof this.animationPresetChangeUnsubscribe === 'function') {
                try {
                    this.animationPresetChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 移除壁纸社区窗口
            if (this.wallpaperCommunityWindow && this.wallpaperCommunityWindow.parentElement) {
                try {
                    this.wallpaperCommunityWindow.parentElement.removeChild(this.wallpaperCommunityWindow);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 移除窗口
            if (this.window && this.window.parentElement) {
                try {
                    this.window.parentElement.removeChild(this.window);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined' && this.pid) {
                try {
                    // 注销壁纸社区窗口
                    if (this.wallpaperCommunityWindowId) {
                        GUIManager.unregisterWindow(this.wallpaperCommunityWindowId);
                    }
                    // 注销主窗口
                    GUIManager.unregisterWindow(this.pid);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 注意：不要在这里调用 ProcessManager.killProgram，因为 killProgram 会调用 __exit__
            // ProcessManager 会在调用 __exit__ 后自动清理资源
        },
        
        /**
         * 打开壁纸社区窗口
         */
        _openWallpaperCommunity: function() {
            // 检查是否已有壁纸社区窗口
            if (this.wallpaperCommunityWindow) {
                // 如果窗口已存在，聚焦到该窗口
                if (typeof GUIManager !== 'undefined' && this.wallpaperCommunityWindowId) {
                    GUIManager.focusWindow(this.wallpaperCommunityWindowId);
                }
                return;
            }
            
            // 创建壁纸社区窗口
            const communityWindow = document.createElement('div');
            communityWindow.className = 'wallpaper-community-window zos-gui-window';
            communityWindow.dataset.pid = this.pid.toString();
            communityWindow.style.cssText = `
                width: 1000px;
                height: 700px;
                display: flex;
                flex-direction: column;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('themeanimator');
                }
                
                const windowInfo = GUIManager.registerWindow(this.pid, communityWindow, {
                    title: '壁纸社区',
                    icon: icon,
                    onClose: () => {
                        // 清理窗口引用
                        this.wallpaperCommunityWindow = null;
                        this.wallpaperCommunityWindowId = null;
                    }
                });
                
                if (windowInfo && windowInfo.windowId) {
                    this.wallpaperCommunityWindowId = windowInfo.windowId;
                }
            }
            
            // 创建窗口内容
            const content = document.createElement('div');
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
                gap: 16px;
            `;
            
            // 搜索栏
            const searchContainer = document.createElement('div');
            searchContainer.style.cssText = `
                display: flex;
                gap: 12px;
                align-items: center;
            `;
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '搜索壁纸（如：猫猫、风景、二次元...）';
            searchInput.style.cssText = `
                flex: 1;
                padding: 10px 16px;
                background: rgba(139, 92, 246, 0.1);
                border: 2px solid rgba(139, 92, 246, 0.3);
                border-radius: 6px;
                color: rgba(215, 224, 221, 0.9);
                font-size: 14px;
                outline: none;
            `;
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this._searchWallpapers(searchInput.value.trim() || '壁纸', 1);
                }
            });
            searchContainer.appendChild(searchInput);
            
            const searchBtn = document.createElement('button');
            searchBtn.textContent = '搜索';
            searchBtn.style.cssText = `
                padding: 10px 24px;
                background: rgba(139, 92, 246, 0.3);
                border: 2px solid rgba(139, 92, 246, 0.5);
                border-radius: 6px;
                color: rgba(215, 224, 221, 0.95);
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            searchBtn.addEventListener('click', () => {
                this._searchWallpapers(searchInput.value.trim() || '壁纸', 1);
            });
            searchBtn.addEventListener('mouseenter', () => {
                searchBtn.style.background = 'rgba(139, 92, 246, 0.4)';
                searchBtn.style.borderColor = 'rgba(139, 92, 246, 0.7)';
            });
            searchBtn.addEventListener('mouseleave', () => {
                searchBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                searchBtn.style.borderColor = 'rgba(139, 92, 246, 0.5)';
            });
            searchContainer.appendChild(searchBtn);
            
            content.appendChild(searchContainer);
            
            // 壁纸列表容器
            const wallpapersContainer = document.createElement('div');
            wallpapersContainer.id = 'wallpapers-list';
            wallpapersContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 16px;
                padding: 8px;
            `;
            content.appendChild(wallpapersContainer);
            
            // 分页控件
            const paginationContainer = document.createElement('div');
            paginationContainer.id = 'wallpapers-pagination';
            paginationContainer.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 12px;
                padding: 12px;
            `;
            content.appendChild(paginationContainer);
            
            communityWindow.appendChild(content);
            
            // 添加到GUI容器
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) {
                guiContainer.appendChild(communityWindow);
            }
            
            // 保存窗口引用
            this.wallpaperCommunityWindow = communityWindow;
            this.wallpaperCommunitySearchInput = searchInput;
            this.wallpaperCommunityContainer = wallpapersContainer;
            this.wallpaperCommunityPagination = paginationContainer;
            this.wallpaperCommunityCurrentPage = 1;
            this.wallpaperCommunityCurrentKeyword = '';
            this.wallpaperCommunityLimit = 12; // 每页12个壁纸
            
            // 默认加载一些壁纸
            this._searchWallpapers('壁纸', 1);
            
            // 聚焦窗口
            if (typeof GUIManager !== 'undefined' && this.wallpaperCommunityWindowId) {
                GUIManager.focusWindow(this.wallpaperCommunityWindowId);
            }
        },
        
        /**
         * 搜索壁纸
         */
        _searchWallpapers: async function(keyword, page) {
            if (!this.wallpaperCommunityContainer) {
                return;
            }
            
            // 显示加载状态
            this.wallpaperCommunityContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: rgba(215, 224, 221, 0.7);">加载中...</div>';
            
            try {
                // 构建API URL
                const apiUrl = `https://api-v1.cenguigui.cn/api/wallpaper/api.php?msg=${encodeURIComponent(keyword)}&type=pc&page=${page}&limit=${this.wallpaperCommunityLimit}`;
                
                // 调用API
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.code !== 200 || !Array.isArray(data.data)) {
                    throw new Error(data.msg || 'API返回数据格式错误');
                }
                
                // 更新当前状态
                this.wallpaperCommunityCurrentPage = page;
                this.wallpaperCommunityCurrentKeyword = keyword;
                
                // 清空容器
                this.wallpaperCommunityContainer.innerHTML = '';
                
                // 显示壁纸列表
                if (data.data.length === 0) {
                    this.wallpaperCommunityContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: rgba(215, 224, 221, 0.7);">未找到相关壁纸</div>';
                } else {
                    data.data.forEach(wallpaper => {
                        const card = this._createWallpaperCard(wallpaper);
                        this.wallpaperCommunityContainer.appendChild(card);
                    });
                }
                
                // 更新分页控件
                this._updateWallpaperPagination(page, data.data.length);
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `搜索壁纸失败: ${error.message}`, error);
                }
                this.wallpaperCommunityContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: rgba(255, 95, 87, 0.8);">加载失败: ${error.message}</div>`;
            }
        },
        
        /**
         * 创建壁纸卡片
         */
        _createWallpaperCard: function(wallpaper) {
            const card = document.createElement('div');
            card.style.cssText = `
                background: rgba(139, 92, 246, 0.05);
                border: 2px solid rgba(139, 92, 246, 0.2);
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 预览图
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 140px;
                background: rgba(139, 92, 246, 0.1);
                background-image: url('${wallpaper.phone_img_url}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                position: relative;
            `;
            
            // 判断是否为动态壁纸
            const isVideo = wallpaper.format && wallpaper.format.toLowerCase().includes('mp4');
            if (isVideo) {
                // 添加视频标记
                const videoBadge = document.createElement('div');
                videoBadge.textContent = '🎬';
                videoBadge.style.cssText = `
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    background: rgba(0, 0, 0, 0.6);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                `;
                preview.appendChild(videoBadge);
                
                // 显示时长
                if (wallpaper.duration) {
                    const durationBadge = document.createElement('div');
                    const minutes = Math.floor(wallpaper.duration / 60);
                    const seconds = wallpaper.duration % 60;
                    durationBadge.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    durationBadge.style.cssText = `
                        position: absolute;
                        bottom: 4px;
                        right: 4px;
                        background: rgba(0, 0, 0, 0.6);
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 11px;
                        color: rgba(215, 224, 221, 0.9);
                    `;
                    preview.appendChild(durationBadge);
                }
            }
            
            card.appendChild(preview);
            
            // 信息区域
            const info = document.createElement('div');
            info.style.cssText = `
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            `;
            
            // 名称
            const name = document.createElement('div');
            name.textContent = wallpaper.name || wallpaper.cname || '未命名';
            name.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            name.title = wallpaper.name || wallpaper.cname || '未命名';
            info.appendChild(name);
            
            // 作者和热度
            const meta = document.createElement('div');
            meta.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: rgba(215, 224, 221, 0.6);
            `;
            
            const author = document.createElement('span');
            author.textContent = `👤 ${wallpaper.author || '未知'}`;
            meta.appendChild(author);
            
            if (wallpaper.hot) {
                const hot = document.createElement('span');
                hot.textContent = `🔥 ${wallpaper.hot}`;
                meta.appendChild(hot);
            }
            
            info.appendChild(meta);
            
            // 分辨率（如果有）
            if (wallpaper.resolution) {
                const resolution = document.createElement('div');
                resolution.textContent = `📐 ${wallpaper.resolution}`;
                resolution.style.cssText = `
                    font-size: 11px;
                    color: rgba(215, 224, 221, 0.5);
                `;
                info.appendChild(resolution);
            }
            
            card.appendChild(info);
            
            // 点击事件
            card.addEventListener('click', async () => {
                await this._downloadAndApplyWallpaper(wallpaper);
            });
            
            card.addEventListener('mouseenter', () => {
                card.style.background = 'rgba(139, 92, 246, 0.1)';
                card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                card.style.transform = 'translateY(-2px)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.background = 'rgba(139, 92, 246, 0.05)';
                card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                card.style.transform = 'translateY(0)';
            });
            
            return card;
        },
        
        /**
         * 更新分页控件
         */
        _updateWallpaperPagination: function(currentPage, itemCount) {
            if (!this.wallpaperCommunityPagination) {
                return;
            }
            
            this.wallpaperCommunityPagination.innerHTML = '';
            
            // 上一页按钮
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '上一页';
            prevBtn.disabled = currentPage <= 1;
            prevBtn.style.cssText = `
                padding: 8px 16px;
                background: ${currentPage <= 1 ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.3)'};
                border: 2px solid ${currentPage <= 1 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.5)'};
                border-radius: 6px;
                color: ${currentPage <= 1 ? 'rgba(215, 224, 221, 0.5)' : 'rgba(215, 224, 221, 0.95)'};
                font-size: 14px;
                cursor: ${currentPage <= 1 ? 'not-allowed' : 'pointer'};
                transition: all 0.2s ease;
            `;
            if (currentPage > 1) {
                prevBtn.addEventListener('click', () => {
                    this._searchWallpapers(this.wallpaperCommunityCurrentKeyword, currentPage - 1);
                });
                prevBtn.addEventListener('mouseenter', () => {
                    prevBtn.style.background = 'rgba(139, 92, 246, 0.4)';
                });
                prevBtn.addEventListener('mouseleave', () => {
                    prevBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                });
            }
            this.wallpaperCommunityPagination.appendChild(prevBtn);
            
            // 页码显示
            const pageInfo = document.createElement('span');
            pageInfo.textContent = `第 ${currentPage} 页`;
            pageInfo.style.cssText = `
                padding: 8px 16px;
                color: rgba(215, 224, 221, 0.7);
                font-size: 14px;
            `;
            this.wallpaperCommunityPagination.appendChild(pageInfo);
            
            // 下一页按钮
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '下一页';
            nextBtn.disabled = itemCount < this.wallpaperCommunityLimit;
            nextBtn.style.cssText = `
                padding: 8px 16px;
                background: ${itemCount < this.wallpaperCommunityLimit ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.3)'};
                border: 2px solid ${itemCount < this.wallpaperCommunityLimit ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.5)'};
                border-radius: 6px;
                color: ${itemCount < this.wallpaperCommunityLimit ? 'rgba(215, 224, 221, 0.5)' : 'rgba(215, 224, 221, 0.95)'};
                font-size: 14px;
                cursor: ${itemCount < this.wallpaperCommunityLimit ? 'not-allowed' : 'pointer'};
                transition: all 0.2s ease;
            `;
            if (itemCount >= this.wallpaperCommunityLimit) {
                nextBtn.addEventListener('click', () => {
                    this._searchWallpapers(this.wallpaperCommunityCurrentKeyword, currentPage + 1);
                });
                nextBtn.addEventListener('mouseenter', () => {
                    nextBtn.style.background = 'rgba(139, 92, 246, 0.4)';
                });
                nextBtn.addEventListener('mouseleave', () => {
                    nextBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                });
            }
            this.wallpaperCommunityPagination.appendChild(nextBtn);
        },
        
        /**
         * 下载并应用壁纸
         */
        _downloadAndApplyWallpaper: async function(wallpaper) {
            try {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', `开始下载壁纸: ${wallpaper.name || wallpaper.id}`);
                }
                
                // 判断是否为动态壁纸
                const isVideo = wallpaper.format && wallpaper.format.toLowerCase().includes('mp4');
                const wallpaperUrl = isVideo ? wallpaper.video_url : wallpaper.phone_img_url;
                
                if (!wallpaperUrl) {
                    throw new Error('壁纸URL不存在');
                }
                
                // 下载壁纸
                const response = await fetch(wallpaperUrl);
                if (!response.ok) {
                    throw new Error(`下载失败: HTTP ${response.status}`);
                }
                
                const blob = await response.blob();
                
                // 将 blob 转换为 base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        const base64 = reader.result;
                        resolve(base64);
                    };
                    reader.onerror = reject;
                });
                reader.readAsDataURL(blob);
                const base64 = await base64Promise;
                
                // 生成文件名
                const extension = isVideo ? '.mp4' : '.jpg';
                const fileName = `wallpaper_community_${wallpaper.id}${extension}`;
                const filePath = `D:/cache/${fileName}`;
                
                // 提取 base64 数据部分（去掉 data:image/jpeg;base64, 或 data:video/mp4;base64, 前缀）
                const base64Data = base64.split(',')[1] || base64;
                
                // 保存文件
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', 'D:/cache/');
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('writeMod', 'overwrite');
                
                const saveResponse = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        content: base64Data,
                        isBase64: true  // 告诉 FSDirve.php 这是 base64 编码，需要解码
                    })
                });
                
                if (!saveResponse.ok) {
                    throw new Error(`保存文件失败: HTTP ${saveResponse.status}`);
                }
                
                const saveResult = await saveResponse.json();
                if (saveResult.status !== 'success') {
                    throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                }
                
                // 使用 ThemeManager 设置壁纸
                if (typeof ThemeManager !== 'undefined') {
                    const success = await ThemeManager.setLocalImageAsBackground(filePath, true);
                    if (success) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `壁纸应用成功: ${filePath}`);
                        }
                        
                        // 更新当前背景显示
                        if (typeof ProcessManager !== 'undefined') {
                            const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                            if (currentBackgroundId) {
                                const currentBackground = ProcessManager.getDesktopBackground(currentBackgroundId, this.pid);
                                if (currentBackground) {
                                    this._updateCurrentBackgroundDisplay(currentBackground);
                                }
                            }
                        }
                        
                        // 刷新背景列表
                        this._updateBackgroundsList();
                        
                        // 成功时静默完成，不显示弹窗
                    } else {
                        throw new Error('应用壁纸失败');
                    }
                } else {
                    throw new Error('ThemeManager 不可用');
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `下载并应用壁纸失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`下载并应用壁纸失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`下载并应用壁纸失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 创建标签页容器
         */
        _createTabsContainer: function() {
            const container = document.createElement('div');
            container.className = 'themeanimator-tabs';
            container.style.cssText = `
                display: flex;
                gap: 8px;
                border-bottom: 2px solid rgba(139, 92, 246, 0.3);
                padding-bottom: 8px;
            `;
            
            const tabs = [
                { id: 'theme', label: '主题', icon: '🎨' },
                { id: 'style', label: '风格', icon: '💅' },
                { id: 'background', label: '背景', icon: '🖼️' },
                { id: 'animation', label: '动画', icon: '✨' },
                { id: 'lockscreen', label: '锁屏', icon: '🔒' }
            ];
            
            tabs.forEach((tab, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'themeanimator-tab';
                tabBtn.dataset.tab = tab.id;
                tabBtn.style.cssText = `
                    padding: 10px 20px;
                    background: transparent;
                    border: none;
                    color: rgba(215, 224, 221, 0.7);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    border-radius: 6px 6px 0 0;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                tabBtn.innerHTML = `<span>${tab.icon}</span><span>${tab.label}</span>`;
                
                if (index === 0) {
                    tabBtn.classList.add('active');
                    tabBtn.style.color = 'rgba(139, 92, 246, 1)';
                    tabBtn.style.background = 'rgba(139, 92, 246, 0.1)';
                }
                
                tabBtn.addEventListener('click', () => {
                    this._switchTab(tab.id);
                });
                
                tabBtn.addEventListener('mouseenter', () => {
                    if (!tabBtn.classList.contains('active')) {
                        tabBtn.style.background = 'rgba(139, 92, 246, 0.05)';
                    }
                });
                
                tabBtn.addEventListener('mouseleave', () => {
                    if (!tabBtn.classList.contains('active')) {
                        tabBtn.style.background = 'transparent';
                    }
                });
                
                container.appendChild(tabBtn);
            });
            
            return container;
        },
        
        /**
         * 切换标签页
         */
        _switchTab: function(tabId) {
            // 更新标签按钮
            const tabs = this.window.querySelectorAll('.themeanimator-tab');
            tabs.forEach(tab => {
                if (tab.dataset.tab === tabId) {
                    tab.classList.add('active');
                    tab.style.color = 'rgba(139, 92, 246, 1)';
                    tab.style.background = 'rgba(139, 92, 246, 0.1)';
                } else {
                    tab.classList.remove('active');
                    tab.style.color = 'rgba(215, 224, 221, 0.7)';
                    tab.style.background = 'transparent';
                }
            });
            
            // 更新面板
            const panels = this.window.querySelectorAll('.themeanimator-panel');
            panels.forEach(panel => {
                if (panel.dataset.panel === tabId) {
                    panel.style.display = 'flex';
                    panel.classList.add('active');
                    
                    // 如果是背景面板，确保按钮可见
                    if (tabId === 'background') {
                        setTimeout(() => {
                            const insideBtn = panel.querySelector('#select-local-image-btn-inside');
                            if (insideBtn) {
                                insideBtn.style.display = 'block';
                                insideBtn.style.visibility = 'visible';
                                insideBtn.style.opacity = '1';
                            }
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '背景面板显示，按钮状态', {
                                    insideBtn: insideBtn ? '存在且可见' : '不存在'
                                });
                            }
                        }, 50);
                    }
                } else {
                    panel.style.display = 'none';
                    panel.classList.remove('active');
                }
            });
        },
        
        /**
         * 创建主题管理面板
         */
        _createThemePanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'theme';
            panel.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前主题显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前主题</h3>
                <div class="current-theme-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-theme-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;">加载中...</div>
                    <div id="current-theme-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7);">正在加载主题信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 主题列表
            const themesSection = document.createElement('div');
            themesSection.className = 'themeanimator-section';
            themesSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用主题</h3>
                <div id="themes-list" class="themes-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(themesSection);
            
            // 加载主题列表
            this._loadThemesList(themesSection.querySelector('#themes-list'));
            
            return panel;
        },
        
        /**
         * 创建风格管理面板
         */
        _createStylePanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'style';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前风格显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前风格</h3>
                <div class="current-style-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-style-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;">加载中...</div>
                    <div id="current-style-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7);">正在加载风格信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 风格列表
            const stylesSection = document.createElement('div');
            stylesSection.className = 'themeanimator-section';
            stylesSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用风格</h3>
                <div id="styles-list" class="styles-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(stylesSection);
            
            // 加载风格列表
            this._loadStylesList(stylesSection.querySelector('#styles-list'));
            
            return panel;
        },
        
        /**
         * 创建背景图管理面板
         */
        _createBackgroundPanel: function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '开始创建背景面板');
            }
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'background';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前背景显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            
            // 创建标题
            const sectionTitle = document.createElement('h3');
            sectionTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: rgba(215, 224, 221, 0.9);
                font-size: 16px;
                font-weight: 600;
            `;
            sectionTitle.textContent = '当前背景';
            currentSection.appendChild(sectionTitle);
            
            // 当前背景信息显示
            const currentBackgroundDisplay = document.createElement('div');
            currentBackgroundDisplay.className = 'current-background-display';
            currentBackgroundDisplay.style.cssText = `
                padding: 16px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(139, 92, 246, 0.3);
            `;
            
            // 创建名称元素
            const nameElement = document.createElement('div');
            nameElement.id = 'current-background-name';
            nameElement.style.cssText = `
                font-size: 18px;
                font-weight: 600;
                color: rgba(139, 92, 246, 1);
                margin-bottom: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            nameElement.textContent = '加载中...';
            currentBackgroundDisplay.appendChild(nameElement);
            
            // 创建描述元素
            const descElement = document.createElement('div');
            descElement.id = 'current-background-description';
            descElement.style.cssText = `
                font-size: 13px;
                color: rgba(215, 224, 221, 0.7);
                margin-bottom: 12px;
                overflow: hidden;
                word-break: break-all;
                word-wrap: break-word;
                line-height: 1.5;
            `;
            descElement.textContent = '正在加载背景信息...';
            currentBackgroundDisplay.appendChild(descElement);
            
            // 在当前背景显示框内也添加一个按钮（更明显）
            const selectLocalImageBtnInside = document.createElement('button');
            selectLocalImageBtnInside.textContent = '📁 选择本地图片/视频作为背景';
            selectLocalImageBtnInside.id = 'select-local-image-btn-inside';
            selectLocalImageBtnInside.className = 'select-local-image-btn-inside';
            selectLocalImageBtnInside.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(139, 92, 246, 0.2) !important;
                border: 2px solid rgba(139, 92, 246, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            selectLocalImageBtnInside.addEventListener('mouseenter', () => {
                selectLocalImageBtnInside.style.background = 'rgba(139, 92, 246, 0.3) !important';
                selectLocalImageBtnInside.style.borderColor = 'rgba(139, 92, 246, 0.7) !important';
                selectLocalImageBtnInside.style.transform = 'translateY(-1px)';
            });
            selectLocalImageBtnInside.addEventListener('mouseleave', () => {
                selectLocalImageBtnInside.style.background = 'rgba(139, 92, 246, 0.2) !important';
                selectLocalImageBtnInside.style.borderColor = 'rgba(139, 92, 246, 0.5) !important';
                selectLocalImageBtnInside.style.transform = 'translateY(0)';
            });
            selectLocalImageBtnInside.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', '点击内部按钮');
                }
                this._openFileSelector();
            });
            currentBackgroundDisplay.appendChild(selectLocalImageBtnInside);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '内部按钮已添加到DOM', { button: selectLocalImageBtnInside, parent: currentBackgroundDisplay });
            }
            
            // 添加随机二次元背景按钮
            const randomAnimeBgBtn = document.createElement('button');
            randomAnimeBgBtn.textContent = '🎨 随机二次元背景';
            randomAnimeBgBtn.id = 'random-anime-bg-btn';
            randomAnimeBgBtn.className = 'random-anime-bg-btn';
            randomAnimeBgBtn.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(108, 142, 255, 0.2) !important;
                border: 2px solid rgba(108, 142, 255, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            randomAnimeBgBtn.addEventListener('mouseenter', () => {
                randomAnimeBgBtn.style.background = 'rgba(108, 142, 255, 0.3) !important';
                randomAnimeBgBtn.style.borderColor = 'rgba(108, 142, 255, 0.7) !important';
                randomAnimeBgBtn.style.transform = 'translateY(-1px)';
            });
            randomAnimeBgBtn.addEventListener('mouseleave', () => {
                randomAnimeBgBtn.style.background = 'rgba(108, 142, 255, 0.2) !important';
                randomAnimeBgBtn.style.borderColor = 'rgba(108, 142, 255, 0.5) !important';
                randomAnimeBgBtn.style.transform = 'translateY(0)';
            });
            randomAnimeBgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._loadRandomAnimeBackground();
            });
            currentBackgroundDisplay.appendChild(randomAnimeBgBtn);
            
            // 添加取消随机二次元背景按钮
            const cancelRandomAnimeBgBtn = document.createElement('button');
            cancelRandomAnimeBgBtn.textContent = '❌ 取消随机二次元背景';
            cancelRandomAnimeBgBtn.id = 'cancel-random-anime-bg-btn';
            cancelRandomAnimeBgBtn.className = 'cancel-random-anime-bg-btn';
            cancelRandomAnimeBgBtn.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(239, 68, 68, 0.2) !important;
                border: 2px solid rgba(239, 68, 68, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            cancelRandomAnimeBgBtn.addEventListener('mouseenter', () => {
                cancelRandomAnimeBgBtn.style.background = 'rgba(239, 68, 68, 0.3) !important';
                cancelRandomAnimeBgBtn.style.borderColor = 'rgba(239, 68, 68, 0.7) !important';
                cancelRandomAnimeBgBtn.style.transform = 'translateY(-1px)';
            });
            cancelRandomAnimeBgBtn.addEventListener('mouseleave', () => {
                cancelRandomAnimeBgBtn.style.background = 'rgba(239, 68, 68, 0.2) !important';
                cancelRandomAnimeBgBtn.style.borderColor = 'rgba(239, 68, 68, 0.5) !important';
                cancelRandomAnimeBgBtn.style.transform = 'translateY(0)';
            });
            cancelRandomAnimeBgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._cancelRandomAnimeBackground();
            });
            currentBackgroundDisplay.appendChild(cancelRandomAnimeBgBtn);
            
            // 添加壁纸社区按钮
            const wallpaperCommunityBtn = document.createElement('button');
            wallpaperCommunityBtn.textContent = '🖼️ 壁纸社区';
            wallpaperCommunityBtn.id = 'wallpaper-community-btn';
            wallpaperCommunityBtn.className = 'wallpaper-community-btn';
            wallpaperCommunityBtn.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(34, 197, 94, 0.2) !important;
                border: 2px solid rgba(34, 197, 94, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            wallpaperCommunityBtn.addEventListener('mouseenter', () => {
                wallpaperCommunityBtn.style.background = 'rgba(34, 197, 94, 0.3) !important';
                wallpaperCommunityBtn.style.borderColor = 'rgba(34, 197, 94, 0.7) !important';
                wallpaperCommunityBtn.style.transform = 'translateY(-1px)';
            });
            wallpaperCommunityBtn.addEventListener('mouseleave', () => {
                wallpaperCommunityBtn.style.background = 'rgba(34, 197, 94, 0.2) !important';
                wallpaperCommunityBtn.style.borderColor = 'rgba(34, 197, 94, 0.5) !important';
                wallpaperCommunityBtn.style.transform = 'translateY(0)';
            });
            wallpaperCommunityBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._openWallpaperCommunity();
            });
            currentBackgroundDisplay.appendChild(wallpaperCommunityBtn);
            
            currentSection.appendChild(currentBackgroundDisplay);
            
            panel.appendChild(currentSection);
            
            // 验证按钮是否已添加到DOM
            setTimeout(() => {
                const insideBtn = panel.querySelector('#select-local-image-btn-inside');
                const currentDisplay = panel.querySelector('.current-background-display');
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', '面板创建完成，检查按钮', {
                        insideBtn: insideBtn ? {
                            exists: true,
                            text: insideBtn.textContent,
                            display: window.getComputedStyle(insideBtn).display,
                            visibility: window.getComputedStyle(insideBtn).visibility,
                            opacity: window.getComputedStyle(insideBtn).opacity,
                            parent: currentDisplay ? 'currentDisplay存在' : 'currentDisplay不存在'
                        } : '不存在',
                        panelDisplay: panel.style.display,
                        panelVisible: window.getComputedStyle(panel).display,
                        panelInDOM: panel.parentElement ? '已添加到DOM' : '未添加到DOM'
                    });
                }
            }, 100);
            
            // 背景图列表
            const backgroundsSection = document.createElement('div');
            backgroundsSection.className = 'themeanimator-section';
            backgroundsSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用背景</h3>
                <div id="backgrounds-list" class="backgrounds-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(backgroundsSection);
            
            // 加载背景图列表
            this._loadBackgroundsList(backgroundsSection.querySelector('#backgrounds-list'));
            
            return panel;
        },
        
        /**
         * 创建动画管理面板
         */
        _createAnimationPanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'animation';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前动画预设显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前动画预设</h3>
                <div class="current-animation-preset-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-animation-preset-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; word-break: break-all;">加载中...</div>
                    <div id="current-animation-preset-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7); overflow: hidden; word-break: break-all; word-wrap: break-word; line-height: 1.5;">正在加载动画预设信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 动画预设列表
            const presetsSection = document.createElement('div');
            presetsSection.className = 'themeanimator-section';
            presetsSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用动画预设</h3>
                <div id="animation-presets-list" class="animation-presets-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(presetsSection);
            
            // 加载动画预设列表
            this._loadAnimationPresetsList(presetsSection.querySelector('#animation-presets-list'));
            
            // 动画信息
            const infoSection = document.createElement('div');
            infoSection.className = 'themeanimator-section';
            infoSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">动画信息</h3>
                <div id="animation-info" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.05);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.2);
                "></div>
            `;
            panel.appendChild(infoSection);
            
            // 加载动画信息
            this._loadAnimationInfo(infoSection.querySelector('#animation-info'));
            
            return panel;
        },
        
        /**
         * 创建锁屏管理面板
         */
        _createLockscreenPanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'lockscreen';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 随机锁屏壁纸开关
            const randomBgSection = document.createElement('div');
            randomBgSection.className = 'themeanimator-section';
            
            const randomBgTitle = document.createElement('h3');
            randomBgTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: rgba(215, 224, 221, 0.9);
                font-size: 16px;
                font-weight: 600;
            `;
            randomBgTitle.textContent = '随机锁屏壁纸';
            randomBgSection.appendChild(randomBgTitle);
            
            const randomBgContainer = document.createElement('div');
            randomBgContainer.style.cssText = `
                padding: 16px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: space-between;
            `;
            
            const randomBgLabel = document.createElement('div');
            randomBgLabel.style.cssText = `
                color: rgba(215, 224, 221, 0.9);
                font-size: 14px;
            `;
            randomBgLabel.textContent = '启用随机锁屏壁纸';
            randomBgContainer.appendChild(randomBgLabel);
            
            const randomBgToggle = document.createElement('input');
            randomBgToggle.type = 'checkbox';
            randomBgToggle.id = 'lockscreen-random-bg-toggle';
            randomBgToggle.style.cssText = `
                width: 48px;
                height: 24px;
                cursor: pointer;
            `;
            
            // 加载当前设置
            if (typeof LStorage !== 'undefined') {
                LStorage.getSystemStorage('system.lockscreenRandomBg').then(enabled => {
                    randomBgToggle.checked = enabled !== false; // 默认启用
                }).catch(() => {
                    randomBgToggle.checked = true; // 默认启用
                });
            } else {
                randomBgToggle.checked = true; // 默认启用
            }
            
            randomBgContainer.appendChild(randomBgToggle);
            randomBgSection.appendChild(randomBgContainer);
            panel.appendChild(randomBgSection);
            
            // 锁屏背景图列表
            const backgroundsSection = document.createElement('div');
            backgroundsSection.className = 'themeanimator-section';
            backgroundsSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">锁屏背景</h3>
                <div id="lockscreen-backgrounds-list" class="lockscreen-backgrounds-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(backgroundsSection);
            
            // 保存背景图列表容器的引用，以便更新可用性
            const backgroundsListContainer = backgroundsSection.querySelector('#lockscreen-backgrounds-list');
            
            // 更新背景图列表可用性的函数
            const updateBackgroundsListAvailability = (randomBgEnabled) => {
                if (!backgroundsListContainer) return;
                
                const cards = backgroundsListContainer.querySelectorAll('.lockscreen-background-card');
                cards.forEach(card => {
                    if (randomBgEnabled) {
                        // 随机壁纸启用时，禁用背景图选择
                        card.style.opacity = '0.5';
                        card.style.cursor = 'not-allowed';
                        card.style.pointerEvents = 'none';
                        card.title = '请先关闭随机锁屏壁纸功能';
                    } else {
                        // 随机壁纸禁用时，启用背景图选择
                        card.style.opacity = '1';
                        card.style.cursor = 'pointer';
                        card.style.pointerEvents = 'auto';
                        card.title = '';
                    }
                });
                
                // 更新提示信息
                const hintElement = backgroundsSection.querySelector('.lockscreen-backgrounds-hint');
                if (randomBgEnabled) {
                    if (!hintElement) {
                        const hint = document.createElement('div');
                        hint.className = 'lockscreen-backgrounds-hint';
                        hint.style.cssText = `
                            padding: 12px;
                            background: rgba(255, 193, 7, 0.1);
                            border: 1px solid rgba(255, 193, 7, 0.3);
                            border-radius: 6px;
                            color: rgba(255, 193, 7, 0.9);
                            font-size: 13px;
                            margin-bottom: 12px;
                            text-align: center;
                        `;
                        hint.textContent = '💡 提示：关闭随机锁屏壁纸后，可以选择固定锁屏背景';
                        backgroundsSection.insertBefore(hint, backgroundsListContainer);
                    }
                } else {
                    if (hintElement) {
                        hintElement.remove();
                    }
                }
            };
            
            randomBgToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                if (typeof LStorage !== 'undefined') {
                    try {
                        await LStorage.setSystemStorage('system.lockscreenRandomBg', enabled);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `随机锁屏壁纸已${enabled ? '启用' : '禁用'}`);
                        }
                        // 更新背景图列表可用性
                        updateBackgroundsListAvailability(enabled);
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', `保存随机锁屏壁纸设置失败: ${error.message}`);
                        }
                    }
                }
            });
            
            // 加载锁屏背景图列表
            this._loadLockscreenBackgroundsList(backgroundsSection.querySelector('#lockscreen-backgrounds-list'));
            
            // 初始化时根据当前设置更新可用性
            if (typeof LStorage !== 'undefined') {
                LStorage.getSystemStorage('system.lockscreenRandomBg').then(enabled => {
                    const randomBgEnabled = enabled !== false; // 默认启用
                    randomBgToggle.checked = randomBgEnabled;
                    // 延迟更新，确保背景图列表已加载
                    setTimeout(() => {
                        updateBackgroundsListAvailability(randomBgEnabled);
                    }, 200);
                }).catch(() => {
                    randomBgToggle.checked = true; // 默认启用
                    setTimeout(() => {
                        updateBackgroundsListAvailability(true);
                    }, 200);
                });
            }
            
            // 组件区域
            const componentsSection = document.createElement('div');
            componentsSection.className = 'themeanimator-section';
            
            const componentsTitle = document.createElement('h3');
            componentsTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: rgba(215, 224, 221, 0.9);
                font-size: 16px;
                font-weight: 600;
            `;
            componentsTitle.textContent = '锁屏组件';
            componentsSection.appendChild(componentsTitle);
            
            // 时间组件开关
            const timeComponentContainer = document.createElement('div');
            timeComponentContainer.style.cssText = `
                padding: 16px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
            `;
            
            const timeComponentLabel = document.createElement('div');
            timeComponentLabel.style.cssText = `
                color: rgba(215, 224, 221, 0.9);
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            timeComponentLabel.innerHTML = '<span>🕐</span><span>时间组件</span>';
            timeComponentContainer.appendChild(timeComponentLabel);
            
            const timeComponentToggle = document.createElement('input');
            timeComponentToggle.type = 'checkbox';
            timeComponentToggle.id = 'lockscreen-time-component-toggle';
            timeComponentToggle.style.cssText = `
                width: 48px;
                height: 24px;
                cursor: pointer;
            `;
            
            // 加载当前设置
            if (typeof LStorage !== 'undefined') {
                LStorage.getSystemStorage('system.lockscreenTimeComponent').then(enabled => {
                    timeComponentToggle.checked = enabled !== false; // 默认启用
                }).catch(() => {
                    timeComponentToggle.checked = true; // 默认启用
                });
            } else {
                timeComponentToggle.checked = true; // 默认启用
            }
            
            timeComponentToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                if (typeof LStorage !== 'undefined') {
                    try {
                        await LStorage.setSystemStorage('system.lockscreenTimeComponent', enabled);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `锁屏时间组件已${enabled ? '启用' : '禁用'}`);
                        }
                        // 更新锁屏界面
                        if (typeof LockScreen !== 'undefined' && LockScreen.container) {
                            const timeContainer = LockScreen.container.querySelector('.lockscreen-time-container');
                            if (timeContainer) {
                                timeContainer.style.display = enabled ? 'flex' : 'none';
                            }
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', `保存锁屏时间组件设置失败: ${error.message}`);
                        }
                    }
                }
            });
            
            timeComponentContainer.appendChild(timeComponentToggle);
            componentsSection.appendChild(timeComponentContainer);
            
            // 每日一言组件开关
            const dailyQuoteContainer = document.createElement('div');
            dailyQuoteContainer.style.cssText = `
                padding: 16px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
            `;
            
            const dailyQuoteLabel = document.createElement('div');
            dailyQuoteLabel.style.cssText = `
                color: rgba(215, 224, 221, 0.9);
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            dailyQuoteLabel.innerHTML = '<span>💬</span><span>每日一言</span>';
            dailyQuoteContainer.appendChild(dailyQuoteLabel);
            
            const dailyQuoteToggle = document.createElement('input');
            dailyQuoteToggle.type = 'checkbox';
            dailyQuoteToggle.id = 'lockscreen-daily-quote-toggle';
            dailyQuoteToggle.style.cssText = `
                width: 48px;
                height: 24px;
                cursor: pointer;
            `;
            
            // 加载当前设置
            if (typeof LStorage !== 'undefined') {
                LStorage.getSystemStorage('system.lockscreenDailyQuote').then(enabled => {
                    dailyQuoteToggle.checked = enabled !== false; // 默认启用
                }).catch(() => {
                    dailyQuoteToggle.checked = true; // 默认启用
                });
            } else {
                dailyQuoteToggle.checked = true; // 默认启用
            }
            
            dailyQuoteToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                if (typeof LStorage !== 'undefined') {
                    try {
                        await LStorage.setSystemStorage('system.lockscreenDailyQuote', enabled);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `锁屏每日一言组件已${enabled ? '启用' : '禁用'}`);
                        }
                        // 更新锁屏界面
                        if (typeof LockScreen !== 'undefined' && LockScreen.container) {
                            const quoteContainer = LockScreen.container.querySelector('.lockscreen-daily-quote-container');
                            if (quoteContainer) {
                                quoteContainer.style.display = enabled ? 'flex' : 'none';
                            }
                        }
                        // 如果启用，刷新每日一言
                        if (enabled && typeof LockScreen !== 'undefined' && typeof LockScreen._loadDailyQuote === 'function') {
                            await LockScreen._loadDailyQuote();
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', `保存锁屏每日一言组件设置失败: ${error.message}`);
                        }
                    }
                }
            });
            
            dailyQuoteContainer.appendChild(dailyQuoteToggle);
            componentsSection.appendChild(dailyQuoteContainer);
            panel.appendChild(componentsSection);
            
            return panel;
        },
        
        /**
         * 加载锁屏背景图列表
         */
        _loadLockscreenBackgroundsList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                // 获取默认锁屏背景图（从 system/assets/start/ 目录）
                const defaultBackgrounds = [
                    { id: 'lockscreen_bg1', name: '锁屏背景 1', path: '/system/assets/start/bg1.jpg' },
                    { id: 'lockscreen_bg2', name: '锁屏背景 2', path: '/system/assets/start/bg2.jpg' },
                    { id: 'lockscreen_bg3', name: '锁屏背景 3', path: '/system/assets/start/bg3.jpg' }
                ];
                
                // 获取已发送的锁屏背景（从 LStorage）
                const sentBackgrounds = await this._getLockscreenBackgroundsList();
                
                // 合并默认背景和已发送的背景
                const allBackgrounds = [...defaultBackgrounds, ...sentBackgrounds];
                
                container.innerHTML = '';
                if (allBackgrounds.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的锁屏背景</p>';
                    return;
                }
                
                // 异步创建卡片（因为需要检查当前选中状态）
                for (const background of allBackgrounds) {
                    const card = await this._createLockscreenBackgroundCard(background);
                    container.appendChild(card);
                }
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载锁屏背景列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建锁屏背景卡片
         */
        _createLockscreenBackgroundCard: async function(background) {
            // 获取当前锁屏背景路径
            let currentLockscreenBg = null;
            if (typeof LStorage !== 'undefined') {
                try {
                    currentLockscreenBg = await LStorage.getSystemStorage('system.lockscreenBackground');
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 检查是否是当前选中的背景
            const isActive = currentLockscreenBg && (
                currentLockscreenBg === background.path ||
                currentLockscreenBg === background.id ||
                (background.id && currentLockscreenBg.includes(background.id))
            );
            
            // 判断是否是默认背景（默认背景的path以 /system/assets/start/ 开头）
            const isDefaultBackground = background.path && background.path.startsWith('/system/assets/start/');
            
            const card = document.createElement('div');
            card.className = 'lockscreen-background-card';
            card.dataset.backgroundId = background.id;
            card.dataset.backgroundPath = background.path;
            card.dataset.isDefaultBackground = isDefaultBackground ? 'true' : 'false';
            card.style.cssText = `
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            `;
            
            // 如果是当前选中的背景，添加选中标记
            if (isActive) {
                const activeBadge = document.createElement('div');
                activeBadge.style.cssText = `
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: rgba(139, 92, 246, 0.9);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                `;
                activeBadge.textContent = '✓ 已选择';
                card.appendChild(activeBadge);
            }
            
            // 处理预览图URL（支持本地路径和网络路径）
            let previewUrl = background.path;
            const isLocalPath = background.path.startsWith('C:') || 
                               background.path.startsWith('D:') || 
                               background.path.includes('/system/service/DISK/');
            
            if (isLocalPath) {
                // 转换为 PHP 服务 URL
                if (background.path.startsWith('C:')) {
                    previewUrl = '/system/service/DISK/C' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.startsWith('D:')) {
                    previewUrl = '/system/service/DISK/D' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.includes('/system/service/DISK/')) {
                    previewUrl = background.path;
                }
            }
            
            // 预览图
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 120px;
                background: rgba(139, 92, 246, 0.1);
                background-image: url('${previewUrl}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
            `;
            card.appendChild(preview);
            
            // 背景名称
            const name = document.createElement('div');
            name.style.cssText = `
                padding: 12px;
                font-size: 14px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            name.textContent = background.name || background.id;
            name.title = background.name || background.id;
            card.appendChild(name);
            
            // 点击事件
            card.addEventListener('click', async () => {
                // 检查随机壁纸是否启用
                let randomBgEnabled = true; // 默认启用
                if (typeof LStorage !== 'undefined') {
                    try {
                        const enabled = await LStorage.getSystemStorage('system.lockscreenRandomBg');
                        randomBgEnabled = enabled !== false; // 默认启用
                    } catch (e) {
                        // 读取失败，使用默认值
                    }
                }
                
                if (randomBgEnabled) {
                    // 如果随机壁纸启用，提示用户
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '请先关闭随机锁屏壁纸功能，才能选择固定背景');
                    }
                    return;
                }
                
                await this._setLockscreenBackground(background);
            });
            
            // 保存 isActive 状态到卡片，以便在事件处理中使用
            card.dataset.isActive = isActive ? 'true' : 'false';
            
            card.addEventListener('mouseenter', () => {
                const cardIsActive = card.dataset.isActive === 'true';
                if (!cardIsActive) {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                    card.style.transform = 'translateY(-2px)';
                } else {
                    // 选中状态下的悬停效果
                    card.style.background = 'rgba(139, 92, 246, 0.2)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.6)';
                }
            });
            
            card.addEventListener('mouseleave', () => {
                const cardIsActive = card.dataset.isActive === 'true';
                if (!cardIsActive) {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                    card.style.transform = 'translateY(0)';
                } else {
                    // 保持选中状态的样式
                    card.style.background = 'rgba(139, 92, 246, 0.15)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                    card.style.transform = 'translateY(0)';
                }
            });
            
            return card;
        },
        
        /**
         * 设置锁屏背景
         */
        _setLockscreenBackground: async function(background) {
            try {
                if (typeof LockScreen === 'undefined' || !LockScreen.container) {
                    throw new Error('LockScreen 不可用');
                }
                
                // 处理背景路径（支持本地路径和网络路径）
                let backgroundUrl = background.path;
                const isLocalPath = background.path.startsWith('C:') || 
                                   background.path.startsWith('D:');
                
                if (isLocalPath) {
                    // 转换为 PHP 服务 URL
                    // 移除开头的盘符和冒号，然后添加服务路径前缀
                    let relativePath = background.path.substring(2);
                    // 替换反斜杠为正斜杠
                    relativePath = relativePath.replace(/\\/g, '/');
                    // 移除开头的斜杠（如果有）
                    relativePath = relativePath.replace(/^\/+/, '');
                    
                    if (background.path.startsWith('C:')) {
                        backgroundUrl = '/system/service/DISK/C/' + relativePath;
                    } else if (background.path.startsWith('D:')) {
                        backgroundUrl = '/system/service/DISK/D/' + relativePath;
                    }
                } else if (background.path.includes('/system/service/DISK/')) {
                    // 已经是服务路径，直接使用
                    backgroundUrl = background.path;
                }
                
                // 保存设置（保存原始路径）
                if (typeof LStorage !== 'undefined') {
                    await LStorage.setSystemStorage('system.lockscreenBackground', background.path);
                }
                
                // 应用背景（使用转换后的URL）
                LockScreen.container.style.backgroundImage = `url(${backgroundUrl})`;
                LockScreen.container.style.backgroundSize = 'cover';
                LockScreen.container.style.backgroundPosition = 'center';
                LockScreen.container.style.backgroundRepeat = 'no-repeat';
                
                // 更新锁屏背景列表UI，显示当前选中的背景
                this._updateLockscreenBackgroundsList();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', `锁屏背景已设置为: ${background.name}`);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `设置锁屏背景失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 加载当前设置
         */
        _loadCurrentSettings: async function() {
            if (typeof ProcessManager === 'undefined') {
                return;
            }
            
            try {
                // 获取当前主题
                const currentTheme = await ProcessManager.getCurrentTheme(this.pid);
                if (currentTheme) {
                    this.currentThemeId = currentTheme.id;
                    this._updateCurrentThemeDisplay(currentTheme);
                }
                
                // 获取当前风格
                const currentStyle = await ProcessManager.getCurrentStyle(this.pid);
                if (currentStyle) {
                    this.currentStyleId = currentStyle.id;
                    this._updateCurrentStyleDisplay(currentStyle);
                }
                
                // 获取当前桌面背景
                const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (currentBackgroundId) {
                    const currentBackground = ProcessManager.getDesktopBackground(currentBackgroundId, this.pid);
                    if (currentBackground) {
                        this._updateCurrentBackgroundDisplay(currentBackground);
                    }
                }
                
                // 获取当前动画预设
                if (typeof ThemeManager !== 'undefined') {
                    const currentPresetId = ThemeManager.getCurrentAnimationPresetId();
                    if (currentPresetId) {
                        this.currentAnimationPresetId = currentPresetId;
                        const currentPreset = ThemeManager.getCurrentAnimationPreset();
                        if (currentPreset) {
                            this._updateCurrentAnimationPresetDisplay(currentPreset);
                        }
                    }
                }
                
                // 检查随机二次元背景的刷新逻辑
                // 如果上次请求失败，刷新时自动再次尝试请求
                // 如果已禁用，则不自动请求
                if (typeof LStorage !== 'undefined') {
                    try {
                        const lastRequestStatus = await LStorage.getSystemStorage('system.randomAnimeBgStatus');
                        if (lastRequestStatus === 'failed') {
                            // 如果上次请求失败，刷新时自动再次尝试请求
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '检测到上次请求失败，刷新时自动再次尝试请求');
                            }
                            // 延迟执行，确保UI已完全加载
                            setTimeout(() => {
                                this._loadRandomAnimeBackground();
                            }, 1000);
                        } else if (lastRequestStatus === 'disabled') {
                            // 如果已禁用，不自动请求
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '随机二次元背景功能已禁用，跳过自动请求');
                            }
                        }
                        // 如果上次请求成功，刷新时不再次请求（保持当前背景）
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取请求状态失败', e);
                        }
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    // 确保错误信息被正确记录
                    const errorMessage = e?.message || e?.toString() || String(e) || '未知错误';
                    const errorStack = e?.stack || '';
                    KernelLogger.error('ThemeAnimator', `加载当前设置失败: ${errorMessage}`, {
                        error: errorMessage,
                        stack: errorStack,
                        pid: this.pid
                    });
                }
            }
        },
        
        /**
         * 设置监听器
         */
        _setupListeners: function() {
            if (typeof ProcessManager === 'undefined') {
                return;
            }
            
            // 监听主题变更
            try {
                const themeChangeListener = (themeId, theme) => {
                    this.currentThemeId = themeId;
                    this._updateCurrentThemeDisplay(theme);
                    this._updateThemesList();
                };
                this.themeChangeUnsubscribe = ProcessManager.onThemeChange(themeChangeListener, this.pid);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    const errorMessage = e?.message || e?.toString() || String(e) || '未知错误';
                    const errorStack = e?.stack || '';
                    KernelLogger.error('ThemeAnimator', `注册主题变更监听器失败: ${errorMessage}`, {
                        error: errorMessage,
                        stack: errorStack,
                        pid: this.pid
                    });
                }
            }
            
            // 监听风格变更
            try {
                const styleChangeListener = (styleId, style) => {
                    this.currentStyleId = styleId;
                    this._updateCurrentStyleDisplay(style);
                    this._updateStylesList();
                };
                this.styleChangeUnsubscribe = ProcessManager.onStyleChange(styleChangeListener, this.pid);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    const errorMessage = e?.message || e?.toString() || String(e) || '未知错误';
                    const errorStack = e?.stack || '';
                    KernelLogger.error('ThemeAnimator', `注册风格变更监听器失败: ${errorMessage}`, {
                        error: errorMessage,
                        stack: errorStack,
                        pid: this.pid
                    });
                }
            }
            
            // 监听动画预设变更
            if (typeof ThemeManager !== 'undefined') {
                try {
                    const animationPresetChangeListener = (presetId, preset) => {
                        this.currentAnimationPresetId = presetId;
                        // 只有当 preset 不为 null 时才更新显示
                        if (preset) {
                            this._updateCurrentAnimationPresetDisplay(preset);
                        }
                        this._updateAnimationPresetsList();
                    };
                    this.animationPresetChangeUnsubscribe = ThemeManager.onAnimationPresetChange(animationPresetChangeListener);
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ThemeAnimator', '注册动画预设变更监听器失败', e);
                    }
                }
            }
        },
        
        /**
         * 加载主题列表
         */
        _loadThemesList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const themes = await ProcessManager.getAllThemes(this.pid);
                if (!themes || themes.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的主题</p>';
                    return;
                }
                
                container.innerHTML = '';
                themes.forEach(theme => {
                    const themeCard = this._createThemeCard(theme);
                    container.appendChild(themeCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载主题列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建主题卡片
         */
        _createThemeCard: function(theme) {
            const card = document.createElement('div');
            card.className = 'theme-card';
            const isActive = theme.id === this.currentThemeId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 主题预览（使用主题的主要颜色）
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 80px;
                border-radius: 6px;
                margin-bottom: 12px;
                background: linear-gradient(135deg, 
                    ${theme.colors?.primary || '#8b5cf6'} 0%, 
                    ${theme.colors?.secondary || '#6366f1'} 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
            card.appendChild(preview);
            
            // 主题名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = theme.name || theme.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 主题描述
            if (theme.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = theme.description;
                desc.title = theme.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前主题';
                card.appendChild(badge);
            }
            
            // 点击切换主题
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换主题: ${theme.id}`);
                        }
                        const result = await ProcessManager.setTheme(theme.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换主题失败: 主题 ${theme.id} 不存在或无法应用`);
                            }
                            // 失败时静默处理，不显示弹窗
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `主题切换成功: ${theme.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换主题失败', e);
                        }
                        // 错误时静默处理，不显示弹窗
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 加载风格列表
         */
        _loadStylesList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const styles = await ProcessManager.getAllStyles(this.pid);
                if (!styles || styles.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的风格</p>';
                    return;
                }
                
                container.innerHTML = '';
                styles.forEach(style => {
                    const styleCard = this._createStyleCard(style);
                    container.appendChild(styleCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载风格列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建风格卡片
         */
        _createStyleCard: function(style) {
            const card = document.createElement('div');
            card.className = 'style-card';
            const isActive = style.id === this.currentStyleId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 风格预览（显示风格特征）
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 80px;
                border-radius: ${style.styles?.window?.borderRadius || '8px'};
                margin-bottom: 12px;
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            `;
            preview.textContent = style.name === 'Ubuntu' ? '🟣' : 
                                 style.name === 'Windows' ? '🟦' : 
                                 style.name === 'macOS' ? '⚪' : 
                                 style.name === 'GNOME' ? '🟢' : 
                                 style.name === 'Material' ? '🔷' : '🎨';
            card.appendChild(preview);
            
            // 风格名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = style.name || style.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 风格描述
            if (style.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = style.description;
                desc.title = style.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前风格';
                card.appendChild(badge);
            }
            
            // 点击切换风格
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换风格: ${style.id}`);
                        }
                        const result = await ProcessManager.setStyle(style.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换风格失败: 风格 ${style.id} 不存在或无法应用`);
                            }
                            // 失败时静默处理，不显示弹窗
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `风格切换成功: ${style.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换风格失败', e);
                        }
                        // 错误时静默处理，不显示弹窗
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前主题显示
         */
        _updateCurrentThemeDisplay: function(theme) {
            const nameEl = this.window.querySelector('#current-theme-name');
            const descEl = this.window.querySelector('#current-theme-description');
            
            if (nameEl) {
                nameEl.textContent = theme.name || theme.id;
            }
            if (descEl) {
                descEl.textContent = theme.description || '无描述';
            }
        },
        
        /**
         * 更新当前风格显示
         */
        _updateCurrentStyleDisplay: function(style) {
            const nameEl = this.window.querySelector('#current-style-name');
            const descEl = this.window.querySelector('#current-style-description');
            
            if (nameEl) {
                const nameText = style.name || style.id;
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = style.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 更新主题列表
         */
        _updateThemesList: function() {
            const container = this.window.querySelector('#themes-list');
            if (container) {
                this._loadThemesList(container);
            }
        },
        
        /**
         * 更新风格列表
         */
        _updateStylesList: function() {
            const container = this.window.querySelector('#styles-list');
            if (container) {
                this._loadStylesList(container);
            }
        },
        
        /**
         * 加载背景图列表
         */
        _loadBackgroundsList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const backgrounds = ProcessManager.getAllDesktopBackgrounds(this.pid);
                if (!backgrounds || backgrounds.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的背景</p>';
                    return;
                }
                
                // 检查每个背景文件是否存在，过滤掉已删除的文件
                const validBackgrounds = [];
                for (const background of backgrounds) {
                    // 检查是否是本地文件路径
                    const isLocalPath = background.path && (
                        background.path.startsWith('C:') || 
                        background.path.startsWith('D:') || 
                        background.path.includes('/system/service/DISK/')
                    );
                    
                    if (isLocalPath) {
                        // 检查文件是否存在
                        const exists = await this._checkFileExists(background.path);
                        if (!exists) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `背景文件不存在，已过滤: ${background.path}`);
                            }
                            continue; // 跳过不存在的文件
                        }
                    }
                    
                    // 文件存在或者是非本地路径（如内置背景），添加到列表
                    validBackgrounds.push(background);
                }
                
                if (validBackgrounds.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的背景</p>';
                    return;
                }
                
                container.innerHTML = '';
                validBackgrounds.forEach(background => {
                    const backgroundCard = this._createBackgroundCard(background);
                    container.appendChild(backgroundCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载背景列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 检查文件是否存在
         * @param {string} filePath 文件路径
         * @returns {Promise<boolean>} 文件是否存在
         */
        _checkFileExists: async function(filePath) {
            try {
                // 转换为 PHP 服务路径
                let phpPath = filePath;
                if (filePath.startsWith('C:')) {
                    phpPath = 'C:' + filePath.substring(2).replace(/\\/g, '/');
                } else if (filePath.startsWith('D:')) {
                    phpPath = 'D:' + filePath.substring(2).replace(/\\/g, '/');
                } else if (filePath.includes('/system/service/DISK/')) {
                    // 已经是服务路径，提取实际路径
                    const match = filePath.match(/\/service\/DISK\/([CD])\/(.+)/);
                    if (match) {
                        phpPath = `${match[1]}:/${match[2]}`;
                    }
                }
                
                // 确保路径格式正确
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 使用 PHP 服务检查文件是否存在
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                url.searchParams.set('action', 'exists');
                url.searchParams.set('path', phpPath);
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    return false;
                }
                
                const result = await response.json();
                if (result.status === 'success' && result.data && result.data.exists && result.data.type === 'file') {
                    // 检查文件扩展名，支持常见图片格式和视频格式
                    const extension = filePath.toLowerCase().split('.').pop() || '';
                    const supportedImageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
                    const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
                    if (supportedImageFormats.includes(extension) || supportedVideoFormats.includes(extension)) {
                        return true;
                    }
                }
                return false;
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', `检查文件存在性失败: ${e.message}`);
                }
                return false;
            }
        },
        
        /**
         * 创建背景图卡片
         */
        _createBackgroundCard: function(background) {
            const card = document.createElement('div');
            card.className = 'background-card';
            const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
            const isActive = background.id === currentBackgroundId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 背景预览（支持图片和视频）
            const preview = document.createElement('div');
            
            // 处理本地文件路径（转换为 PHP 服务 URL）
            let previewUrl = background.path;
            const isLocalPath = background.path.startsWith('C:') || 
                               background.path.startsWith('D:') || 
                               background.path.includes('/system/service/DISK/');
            
            if (isLocalPath) {
                // 转换为 PHP 服务 URL
                if (background.path.startsWith('C:')) {
                    previewUrl = '/system/service/DISK/C' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.startsWith('D:')) {
                    previewUrl = '/system/service/DISK/D' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.includes('/system/service/DISK/')) {
                    previewUrl = background.path;
                }
            }
            
            // 检测文件类型
            const fileExtension = background.path.toLowerCase().split('.').pop() || '';
            const isVideo = fileExtension === 'mp4' || fileExtension === 'webm' || fileExtension === 'ogg';
            
            preview.style.cssText = `
                width: 100%;
                height: 100px;
                border-radius: 6px;
                margin-bottom: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                overflow: hidden;
                position: relative;
                background: rgba(0, 0, 0, 0.3);
            `;
            
            if (isVideo) {
                // 视频预览：使用 video 元素
                const video = document.createElement('video');
                video.src = previewUrl;
                video.muted = true;
                video.loop = true;
                video.autoplay = true;
                video.playsInline = true;
                video.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;
                preview.appendChild(video);
                
                // 添加视频图标标记
                const videoBadge = document.createElement('div');
                videoBadge.textContent = '🎬';
                videoBadge.style.cssText = `
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    background: rgba(0, 0, 0, 0.6);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                `;
                preview.appendChild(videoBadge);
            } else {
                // 图片预览：使用背景图片
                preview.style.backgroundImage = `url('${previewUrl}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.style.backgroundRepeat = 'no-repeat';
            }
            
            card.appendChild(preview);
            
            // 背景名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            name.textContent = background.name || background.id;
            name.title = background.name || background.id; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 如果是本地文件，显示文件路径信息
            if (isLocalPath && background.path) {
                // 提取文件名
                const fileName = background.path.split(/[/\\]/).pop() || background.path;
                const fileLabel = document.createElement('div');
                fileLabel.style.cssText = `
                    font-size: 11px;
                    color: rgba(215, 224, 221, 0.5);
                    margin-bottom: 2px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    word-break: break-all;
                `;
                fileLabel.textContent = fileName;
                fileLabel.title = fileName; // 添加 title 属性
                card.appendChild(fileLabel);
                
                // 显示文件路径标签和路径
                const pathContainer = document.createElement('div');
                pathContainer.style.cssText = `
                    font-size: 10px;
                    color: rgba(215, 224, 221, 0.4);
                    margin-bottom: 4px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    word-break: break-all;
                `;
                const isVideoFile = isVideo;
                pathContainer.textContent = `${isVideoFile ? '本地视频' : '本地图片'}: ${background.path}`;
                pathContainer.title = `${isVideoFile ? '本地视频' : '本地图片'}: ${background.path}`; // 添加 title 属性
                card.appendChild(pathContainer);
            }
            
            // 背景描述
            if (background.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = background.description;
                desc.title = background.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前背景';
                card.appendChild(badge);
            }
            
            // 判断是否是预设背景（内置背景）
            const builtinBackgroundIds = ['default', 'cyberpunk', 'minimalist', 'nature', 'cosmic', 'warm'];
            const isBuiltinBackground = builtinBackgroundIds.includes(background.id);
            
            // 判断是否是本地背景（非预设背景）
            const isLocalBackground = isLocalPath && !isBuiltinBackground;
            
            // 判断是否是随机二次元背景图
            const isRandomAnimeBg = background.path && (
                background.path.includes('random_anime_bg') || 
                background.path.includes('D:/cache/random_anime_bg')
            );
            
            // 为本地背景添加 data 属性，用于右键菜单识别
            if (isLocalBackground) {
                card.dataset.backgroundId = background.id;
                card.dataset.isRandomAnimeBg = isRandomAnimeBg ? 'true' : 'false';
                card.classList.add('local-background-card');
            }
            
            // 点击切换背景
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换桌面背景: ${background.id}`);
                        }
                        const result = await ProcessManager.setDesktopBackground(background.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换桌面背景失败: 背景 ${background.id} 不存在或无法应用`);
                            }
                            // 失败时静默处理，不显示弹窗
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `桌面背景切换成功: ${background.id}`);
                            }
                            // 更新当前背景显示
                            this._updateCurrentBackgroundDisplay(background);
                            // 更新背景列表
                            this._updateBackgroundsList();
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换桌面背景失败', e);
                        }
                        // 错误时静默处理，不显示弹窗
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前背景显示
         */
        _updateCurrentBackgroundDisplay: function(background) {
            const nameEl = this.window.querySelector('#current-background-name');
            const descEl = this.window.querySelector('#current-background-description');
            
            if (nameEl) {
                const nameText = background.name || background.id;
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = background.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 注册本地背景卡片的右键菜单（删除功能）
         */
        _registerBackgroundContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }
            
            const self = this;
            
            // 注册右键菜单，使用选择器匹配所有本地背景卡片
            // 使用函数形式的 items，在运行时获取目标元素
            ContextMenuManager.registerContextMenu(this.pid, {
                context: '*',
                selector: '.local-background-card',
                priority: 100,
                items: (target) => {
                    // 从目标元素获取背景卡片
                    const card = target.closest('.local-background-card');
                    if (!card || !card.dataset.backgroundId) {
                        return []; // 如果找不到卡片，返回空数组
                    }
                    
                    const backgroundId = card.dataset.backgroundId;
                    const isRandomAnimeBg = card.dataset.isRandomAnimeBg === 'true';
                    
                    // 返回菜单项数组
                    return [
                        {
                            label: '发送到锁屏背景',
                            action: async () => {
                                // 获取背景对象
                                if (typeof ProcessManager === 'undefined') {
                                    return;
                                }
                                
                                const background = ProcessManager.getDesktopBackground(backgroundId, self.pid);
                                if (!background) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `找不到背景对象: ${backgroundId}`);
                                    }
                                    return;
                                }
                                
                                // 执行发送到锁屏背景
                                await self._sendToLockscreenBackground(background);
                            }
                        },
                        {
                            label: '删除',
                            action: async () => {
                                // 获取背景对象
                                if (typeof ProcessManager === 'undefined') {
                                    return;
                                }
                                
                                const background = ProcessManager.getDesktopBackground(backgroundId, self.pid);
                                if (!background) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `找不到背景对象: ${backgroundId}`);
                                    }
                                    return;
                                }
                                
                                // 执行删除
                                await self._deleteBackground(background, isRandomAnimeBg);
                            }
                        }
                    ];
                }
            });
        },
        
        /**
         * 发送背景到锁屏背景
         */
        _sendToLockscreenBackground: async function(background) {
            try {
                if (!background || !background.path) {
                    throw new Error('背景信息不完整');
                }
                
                // 检查是否是本地文件路径
                const isLocalPath = background.path.startsWith('C:') || 
                                   background.path.startsWith('D:') || 
                                   background.path.includes('/system/service/DISK/');
                
                if (!isLocalPath) {
                    throw new Error('只能发送本地背景到锁屏');
                }
                
                // 获取文件扩展名
                const fileExtension = background.path.toLowerCase().split('.').pop() || '';
                const supportedImageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
                const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
                const isVideo = supportedVideoFormats.includes(fileExtension);
                const isImage = supportedImageFormats.includes(fileExtension);
                
                if (!isImage && !isVideo) {
                    throw new Error('不支持的文件格式');
                }
                
                // 生成锁屏背景文件名（基于原文件名和背景ID，确保唯一性）
                const originalFileName = background.path.split(/[/\\]/).pop() || 'background';
                const fileNameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');
                const lockscreenFileName = `lockscreen_${background.id}_${fileNameWithoutExt}.${fileExtension}`;
                const lockscreenFilePath = `D:/cache/lockscreen/${lockscreenFileName}`;
                
                // 检查是否已经发送过（去重）
                const lockscreenBackgrounds = await this._getLockscreenBackgroundsList();
                const alreadyExists = lockscreenBackgrounds.some(bg => {
                    // 检查路径或ID是否已存在
                    return bg.path === lockscreenFilePath || 
                           bg.id === `lockscreen_${background.id}` ||
                           (bg.originalBackgroundId && bg.originalBackgroundId === background.id);
                });
                
                if (alreadyExists) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `该背景已发送到锁屏: ${lockscreenFileName}`);
                    }
                    // 静默处理，不显示弹窗
                    return;
                }
                
                // 读取原文件
                let fileContent = null;
                let isBase64 = false;
                
                // 解析路径，拆分为目录路径和文件名
                let dirPath = '';
                let fileName = '';
                
                if (background.path.includes('/system/service/DISK/')) {
                    // 从服务路径提取实际路径：/system/service/DISK/C/path/to/file
                    const match = background.path.match(/\/service\/DISK\/([CD])\/(.+)/);
                    if (match) {
                        const disk = match[1];
                        const relativePath = match[2];
                        // 规范化路径：移除多余的斜杠
                        const normalizedPath = relativePath.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
                        
                        // 拆分路径和文件名
                        const pathParts = normalizedPath.split('/');
                        fileName = pathParts.pop() || '';
                        const dirParts = pathParts;
                        
                        if (dirParts.length > 0) {
                            dirPath = `${disk}:/${dirParts.join('/')}`;
                        } else {
                            dirPath = `${disk}:`;
                        }
                    }
                } else if (background.path.startsWith('C:') || background.path.startsWith('D:')) {
                    // 处理 Windows 路径格式：C:/path 或 C:\path
                    const disk = background.path.substring(0, 1);
                    let relativePath = background.path.substring(2);
                    
                    // 替换反斜杠为正斜杠
                    relativePath = relativePath.replace(/\\/g, '/');
                    
                    // 移除开头的多个斜杠
                    relativePath = relativePath.replace(/^\/+/, '');
                    
                    // 拆分路径和文件名
                    const pathParts = relativePath.split('/').filter(p => p);
                    if (pathParts.length > 0) {
                        fileName = pathParts.pop() || '';
                        if (pathParts.length > 0) {
                            dirPath = `${disk}:/${pathParts.join('/')}`;
                        } else {
                            dirPath = `${disk}:`;
                        }
                    } else {
                        // 如果路径只有盘符，无法确定文件名
                        throw new Error('无法从路径中提取文件名');
                    }
                } else {
                    throw new Error('不支持的路径格式');
                }
                
                if (!dirPath || !fileName) {
                    throw new Error('无法解析文件路径');
                }
                
                // 读取文件
                const readUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                readUrl.searchParams.set('action', 'read_file');
                readUrl.searchParams.set('path', dirPath);
                readUrl.searchParams.set('fileName', fileName);
                
                const readResponse = await fetch(readUrl.toString());
                if (!readResponse.ok) {
                    throw new Error(`读取文件失败: HTTP ${readResponse.status}`);
                }
                
                const readResult = await readResponse.json();
                if (readResult.status !== 'success') {
                    throw new Error(`读取文件失败: ${readResult.message || '未知错误'}`);
                }
                
                // 获取文件内容
                fileContent = readResult.data.content;
                isBase64 = readResult.data.isBase64 || false;
                
                // 确保锁屏缓存目录存在
                const createDirUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                createDirUrl.searchParams.set('action', 'create_dir');
                createDirUrl.searchParams.set('path', 'D:/cache/');
                createDirUrl.searchParams.set('name', 'lockscreen');
                
                try {
                    const createDirResponse = await fetch(createDirUrl.toString());
                    // 409 表示目录已存在，这是正常情况
                    if (!createDirResponse.ok && createDirResponse.status !== 409) {
                        const errorResult = await createDirResponse.json().catch(() => ({}));
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建锁屏缓存目录失败: ${errorResult.message || `HTTP ${createDirResponse.status}`}`);
                        }
                    }
                } catch (e) {
                    // 网络错误，忽略（目录可能已存在）
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '创建锁屏缓存目录时出错', e);
                    }
                }
                
                // 保存到锁屏缓存目录
                const saveUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                saveUrl.searchParams.set('action', 'write_file');
                saveUrl.searchParams.set('path', 'D:/cache/lockscreen/');
                saveUrl.searchParams.set('fileName', lockscreenFileName);
                saveUrl.searchParams.set('writeMod', 'overwrite');
                
                const saveResponse = await fetch(saveUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        content: fileContent,
                        isBase64: isBase64
                    })
                });
                
                if (!saveResponse.ok) {
                    throw new Error(`保存文件失败: HTTP ${saveResponse.status}`);
                }
                
                const saveResult = await saveResponse.json();
                if (saveResult.status !== 'success') {
                    throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                }
                
                // 添加到锁屏背景列表
                await this._addToLockscreenBackgroundsList({
                    id: `lockscreen_${background.id}`,
                    name: background.name || `锁屏: ${background.name || background.id}`,
                    path: lockscreenFilePath,
                    description: `来自桌面背景: ${background.name || background.id}`,
                    source: 'desktop_background',
                    originalBackgroundId: background.id
                });
                
                // 刷新锁屏背景列表
                this._updateLockscreenBackgroundsList();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', `背景已发送到锁屏: ${lockscreenFileName}`);
                }
                
                // 成功时静默完成，不显示弹窗
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `发送背景到锁屏失败: ${error.message}`, error);
                }
                // 错误时静默处理，不显示弹窗
            }
        },
        
        /**
         * 获取锁屏背景列表
         */
        _getLockscreenBackgroundsList: async function() {
            if (typeof LStorage !== 'undefined') {
                try {
                    const list = await LStorage.getSystemStorage('system.lockscreenBackgrounds');
                    return Array.isArray(list) ? list : [];
                } catch (e) {
                    return [];
                }
            }
            return [];
        },
        
        /**
         * 添加到锁屏背景列表
         */
        _addToLockscreenBackgroundsList: async function(background) {
            if (typeof LStorage === 'undefined') {
                return;
            }
            
            try {
                const list = await this._getLockscreenBackgroundsList();
                
                // 检查是否已存在（去重）
                const exists = list.some(bg => bg.path === background.path || bg.id === background.id);
                if (exists) {
                    return; // 已存在，不重复添加
                }
                
                list.push(background);
                await LStorage.setSystemStorage('system.lockscreenBackgrounds', list);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `添加到锁屏背景列表失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 更新锁屏背景列表显示
         */
        _updateLockscreenBackgroundsList: function() {
            const container = this.window.querySelector('#lockscreen-backgrounds-list');
            if (container) {
                this._loadLockscreenBackgroundsList(container);
            }
        },
        
        /**
         * 注册锁屏背景卡片的右键菜单（删除功能）
         */
        _registerLockscreenBackgroundContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }
            
            const self = this;
            
            // 注册右键菜单，使用选择器匹配所有锁屏背景卡片
            ContextMenuManager.registerContextMenu(this.pid, {
                context: '*',
                selector: '.lockscreen-background-card',
                priority: 100,
                items: (target) => {
                    // 从目标元素获取背景卡片
                    const card = target.closest('.lockscreen-background-card');
                    if (!card || !card.dataset.backgroundPath) {
                        return []; // 如果找不到卡片，返回空数组
                    }
                    
                    const isDefaultBackground = card.dataset.isDefaultBackground === 'true';
                    const backgroundPath = card.dataset.backgroundPath;
                    const backgroundId = card.dataset.backgroundId;
                    
                    // 只有发送过来的背景才能删除（非默认背景）
                    if (isDefaultBackground) {
                        return []; // 默认背景不显示删除菜单
                    }
                    
                    // 返回菜单项数组
                    return [
                        {
                            label: '删除',
                            action: async () => {
                                try {
                                    // 执行删除
                                    await self._deleteLockscreenBackground(backgroundPath, backgroundId);
                                } catch (error) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.error('ThemeAnimator', `删除锁屏背景失败: ${error.message}`);
                                    }
                                }
                            }
                        }
                    ];
                }
            });
        },
        
        /**
         * 删除锁屏背景
         */
        _deleteLockscreenBackground: async function(backgroundPath, backgroundId) {
            try {
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 不可用');
                }
                
                // 检查是否是本地文件路径（只有本地文件才能删除）
                const isLocalPath = backgroundPath.startsWith('C:') || 
                                   backgroundPath.startsWith('D:') || 
                                   backgroundPath.includes('/system/service/DISK/');
                
                if (!isLocalPath) {
                    throw new Error('只能删除本地锁屏背景');
                }
                
                // 使用内核API删除文件
                const deleteResult = await ProcessManager.callKernelAPI(
                    this.pid,
                    'FileSystem.delete',
                    [backgroundPath]
                );
                
                if (!deleteResult || deleteResult.status !== 'success') {
                    throw new Error(deleteResult?.message || '删除文件失败');
                }
                
                // 从锁屏背景列表中移除
                await this._removeFromLockscreenBackgroundsList(backgroundPath, backgroundId);
                
                // 如果删除的是当前选中的锁屏背景，清除设置
                if (typeof LStorage !== 'undefined') {
                    try {
                        const currentLockscreenBg = await LStorage.getSystemStorage('system.lockscreenBackground');
                        if (currentLockscreenBg === backgroundPath || 
                            currentLockscreenBg === backgroundId ||
                            (backgroundId && currentLockscreenBg.includes(backgroundId))) {
                            // 清除当前锁屏背景设置
                            await LStorage.setSystemStorage('system.lockscreenBackground', null);
                            
                            // 重置锁屏背景为默认
                            if (typeof LockScreen !== 'undefined' && LockScreen.container) {
                                LockScreen.container.style.backgroundImage = '';
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                // 更新锁屏背景列表显示
                this._updateLockscreenBackgroundsList();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', `锁屏背景删除成功: ${backgroundPath}`);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `删除锁屏背景失败: ${error.message}`);
                }
                throw error;
            }
        },
        
        /**
         * 从锁屏背景列表中移除
         */
        _removeFromLockscreenBackgroundsList: async function(backgroundPath, backgroundId) {
            if (typeof LStorage === 'undefined') {
                return;
            }
            
            try {
                const list = await this._getLockscreenBackgroundsList();
                
                // 过滤掉要删除的背景
                const filteredList = list.filter(bg => {
                    return bg.path !== backgroundPath && 
                           bg.id !== backgroundId &&
                           !(backgroundId && bg.id && bg.id.includes(backgroundId));
                });
                
                // 保存更新后的列表
                await LStorage.setSystemStorage('system.lockscreenBackgrounds', filteredList);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', `从锁屏背景列表移除失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 更新背景列表
         */
        _updateBackgroundsList: async function() {
            const container = this.window.querySelector('#backgrounds-list');
            if (container) {
                await this._loadBackgroundsList(container);
            }
        },
        
        /**
         * 打开文件选择器（用于选择本地图片作为背景）
         */
        _openFileSelector: async function() {
            if (typeof ProcessManager === 'undefined') {
                // ProcessManager 不可用，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '主题管理器',
                            content: 'ProcessManager 不可用',
                            duration: 3000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', `ProcessManager 不可用，且创建通知失败: ${e.message}`);
                        }
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ThemeAnimator', 'ProcessManager 不可用');
                    }
                }
                return;
            }
            
            try {
                // 启动文件管理器作为文件选择器
                const fileManagerPid = await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'file-selector',  // 文件选择器模式
                    onFileSelected: async (selectedFile) => {
                        // 检查文件类型是否为图片或视频
                        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
                        const videoExtensions = ['mp4', 'webm', 'ogg'];
                        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || '';
                        const isImage = imageExtensions.includes(extension);
                        const isVideo = videoExtensions.includes(extension);
                        
                        if (!isImage && !isVideo) {
                            // 文件类型不正确，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '主题管理器',
                                        content: '请选择图片文件（jpg, png, gif, bmp, svg, webp, ico）或视频文件（mp4, webm, ogg）',
                                        duration: 4000
                                    });
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                    }
                                }
                            }
                            return;
                        }
                        
                        // 使用 ThemeManager 设置本地图片或视频作为背景
                        if (typeof ThemeManager !== 'undefined') {
                            try {
                                let result = false;
                                if (isVideo) {
                                    // 设置视频背景
                                    result = await ThemeManager.setLocalVideoAsBackground(selectedFile.path, true);
                                } else {
                                    // 设置图片背景
                                    result = await ThemeManager.setLocalImageAsBackground(selectedFile.path, true);
                                }
                                
                                if (result) {
                                    // 更新背景列表
                                    this._updateBackgroundsList();
                                    
                                    // 更新当前背景显示
                                    const currentBackgroundId = ThemeManager.getCurrentDesktopBackground();
                                    if (currentBackgroundId) {
                                        const currentBackground = ThemeManager.getDesktopBackground(currentBackgroundId);
                                        if (currentBackground) {
                                            this._updateCurrentBackgroundDisplay(currentBackground);
                                        }
                                    }
                                    
                                    // 背景设置成功，使用通知提示（不打断用户）
                                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                        try {
                                            await NotificationManager.createNotification(this.pid, {
                                                type: 'snapshot',
                                                title: '设置成功',
                                                content: `背景设置成功！${isVideo ? '（视频将静音循环播放）' : ''}`,
                                                duration: 3000
                                            });
                                        } catch (e) {
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                            }
                                        }
                                    }
                                } else {
                                    // 设置背景失败，使用通知提示（不打断用户）
                                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                        try {
                                            await NotificationManager.createNotification(this.pid, {
                                                type: 'snapshot',
                                                title: '设置失败',
                                                content: `设置背景失败：${isVideo ? '视频' : '图片'}不存在或无法访问`,
                                                duration: 4000
                                            });
                                        } catch (e) {
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('ThemeAnimator', '设置本地背景失败', e);
                                }
                                // 设置背景失败，使用通知提示（不打断用户）
                                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                    try {
                                        await NotificationManager.createNotification(this.pid, {
                                            type: 'snapshot',
                                            title: '设置失败',
                                            content: `设置背景失败: ${e.message}`,
                                            duration: 4000
                                        });
                                    } catch (notifError) {
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                                        }
                                    }
                                }
                            }
                        } else {
                            // ThemeManager 不可用，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '主题管理器',
                                        content: 'ThemeManager 不可用',
                                        duration: 3000
                                    });
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.error('ThemeAnimator', `ThemeManager 不可用，且创建通知失败: ${e.message}`);
                                    }
                                }
                            } else {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('ThemeAnimator', 'ThemeManager 不可用');
                                }
                            }
                        }
                    }
                });
                
                if (!fileManagerPid) {
                    // 无法启动文件管理器，使用通知提示（不打断用户）
                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                        try {
                            await NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '主题管理器',
                                content: '无法启动文件管理器',
                                duration: 3000
                            });
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `无法启动文件管理器，且创建通知失败: ${e.message}`);
                            }
                        }
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '无法启动文件管理器');
                        }
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '打开文件选择器失败', e);
                }
                // 打开文件选择器失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '错误',
                            content: `打开文件选择器失败: ${e.message}`,
                            duration: 4000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
            }
        },
        
        /**
         * 加载动画预设列表
         */
        _loadAnimationPresetsList: async function(container) {
            if (typeof ThemeManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ThemeManager 不可用</p>';
                return;
            }
            
            try {
                const presets = ThemeManager.getAllAnimationPresets();
                if (!presets || presets.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的动画预设</p>';
                    return;
                }
                
                container.innerHTML = '';
                presets.forEach(preset => {
                    const presetCard = this._createAnimationPresetCard(preset);
                    container.appendChild(presetCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载动画预设列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建动画预设卡片
         */
        _createAnimationPresetCard: function(preset) {
            const card = document.createElement('div');
            card.className = 'animation-preset-card';
            const isActive = preset.id === this.currentAnimationPresetId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 预设图标（根据预设类型显示不同图标）
            const icon = document.createElement('div');
            icon.style.cssText = `
                width: 100%;
                height: 60px;
                border-radius: 6px;
                margin-bottom: 12px;
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
            `;
            icon.textContent = preset.id === 'smooth' ? '🌊' : 
                              preset.id === 'fast' ? '⚡' : 
                              preset.id === 'elegant' ? '✨' : 
                              preset.id === 'bouncy' ? '🎈' : '🎨';
            card.appendChild(icon);
            
            // 预设名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = preset.name || preset.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 预设描述
            if (preset.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = preset.description;
                desc.title = preset.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前预设';
                card.appendChild(badge);
            }
            
            // 点击切换预设
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换动画预设: ${preset.id}`);
                        }
                        const result = await ThemeManager.setAnimationPreset(preset.id, true);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换动画预设失败: 预设 ${preset.id} 不存在或无法应用`);
                            }
                            // 失败时静默处理，不显示弹窗
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `动画预设切换成功: ${preset.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换动画预设失败', e);
                        }
                        // 错误时静默处理，不显示弹窗
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前动画预设显示
         */
        _updateCurrentAnimationPresetDisplay: function(preset) {
            if (!preset) {
                return;
            }
            
            const nameEl = this.window.querySelector('#current-animation-preset-name');
            const descEl = this.window.querySelector('#current-animation-preset-description');
            
            if (nameEl) {
                const nameText = preset.name || preset.id || '未知';
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = preset.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 更新动画预设列表
         */
        _updateAnimationPresetsList: function() {
            const container = this.window.querySelector('#animation-presets-list');
            if (container) {
                this._loadAnimationPresetsList(container);
            }
        },
        
        /**
         * 加载动画信息
         */
        _loadAnimationInfo: function(container) {
            if (typeof AnimateManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">AnimateManager 不可用</p>';
                return;
            }
            
            try {
                const presets = AnimateManager.ANIMATION_PRESETS || {};
                const keyframes = AnimateManager.KEYFRAMES || {};
                
                let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
                
                // 动画类别数量
                const presetCount = Object.keys(presets).length;
                html += `<div style="padding: 12px; background: rgba(139, 92, 246, 0.05); border-radius: 6px;">
                    <strong style="color: rgba(215, 224, 221, 0.9);">动画类别:</strong> 
                    <span style="color: rgba(139, 92, 246, 1);">${presetCount} 个</span>
                </div>`;
                
                // Keyframes数量
                const keyframeCount = Object.keys(keyframes).length;
                html += `<div style="padding: 12px; background: rgba(139, 92, 246, 0.05); border-radius: 6px;">
                    <strong style="color: rgba(215, 224, 221, 0.9);">关键帧动画:</strong> 
                    <span style="color: rgba(139, 92, 246, 1);">${keyframeCount} 个</span>
                </div>`;
                
                html += '</div>';
                container.innerHTML = html;
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载动画信息失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 加载随机二次元背景
         */
        _loadRandomAnimeBackground: async function() {
            const btn = this.window.querySelector('#random-anime-bg-btn');
            if (!btn) return;
            
            // 防止重复请求
            if (this._loadingRandomAnimeBg) {
                // 正在加载中，静默处理（不打断用户）
                return;
            }
            
            // 设置加载标志
            this._loadingRandomAnimeBg = true;
            
            // 禁用按钮并显示加载状态
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ 正在加载...';
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            
            try {
                // 通过 PHP 代理请求随机二次元背景图片（避免 CORS 问题）
                const proxyUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.IMAGE_PROXY)
                    : new URL(SystemInformation.getImageProxyPath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                proxyUrl.searchParams.set('url', 'https://uapis.cn/api/v1/random/image?category=acg&type=pc');
                const response = await fetch(proxyUrl.toString());
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // 检查响应类型
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('image/')) {
                    throw new Error('响应不是图片类型');
                }
                
                // 获取图片 blob
                const blob = await response.blob();
                
                // 将 blob 转换为 base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        const base64 = reader.result;
                        resolve(base64);
                    };
                    reader.onerror = reject;
                });
                reader.readAsDataURL(blob);
                const base64 = await base64Promise;
                
                // 生成文件名（使用时间戳）
                const timestamp = Date.now();
                const fileName = `random_anime_bg_${timestamp}.jpg`;
                const filePath = `D:/cache/${fileName}`;
                
                // 确保目录存在（直接尝试创建，409 表示已存在，忽略即可）
                const createDirUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                createDirUrl.searchParams.set('action', 'create_dir');
                createDirUrl.searchParams.set('path', 'D:/');
                createDirUrl.searchParams.set('name', 'cache');
                
                try {
                    const createDirResponse = await fetch(createDirUrl.toString());
                    // 409 表示目录已存在，这是正常情况，完全忽略
                    // 其他错误才记录警告
                    if (!createDirResponse.ok && createDirResponse.status !== 409) {
                        const errorResult = await createDirResponse.json().catch(() => ({}));
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建目录失败: ${errorResult.message || `HTTP ${createDirResponse.status}`}`);
                        }
                    }
                } catch (e) {
                    // 网络错误，忽略（目录可能已存在）
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '创建目录时出错', e);
                    }
                }
                
                // 清理旧的随机二次元背景图（通过 CacheDrive 管理）
                try {
                    await this._cleanupOldRandomAnimeBackgrounds();
                } catch (e) {
                    // 清理失败不影响新图片的保存
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '清理旧背景图失败', e);
                    }
                }
                
                // 保存图片到本地（使用 FileSystem API）
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 不可用');
                }
                
                // 提取 base64 数据部分（去掉 data:image/jpeg;base64, 前缀）
                const base64Data = base64.split(',')[1] || base64;
                
                // 使用 FileSystem.write 保存图片文件（通过 PHP 服务，支持 base64）
                const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', 'D:/cache/');
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('writeMod', 'overwrite');
                
                const saveResponse = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        content: base64Data,
                        isBase64: true  // 告诉 FSDirve.php 这是 base64 编码，需要解码
                    })
                });
                
                if (!saveResponse.ok) {
                    throw new Error(`保存文件失败: HTTP ${saveResponse.status}`);
                }
                
                const saveResult = await saveResponse.json();
                if (saveResult.status !== 'success') {
                    throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                }
                
                // 使用 CacheDrive 保存图片元数据（永不过期，除非功能被禁用）
                const cacheKey = `random_anime_bg:${fileName}`;
                const cacheValue = {
                    filePath: filePath,
                    fileName: fileName,
                    timestamp: timestamp,
                    source: 'uapis.cn'
                };
                
                try {
                    await ProcessManager.callKernelAPI(
                        this.pid,
                        'Cache.set',
                        [cacheKey, cacheValue, { ttl: 0 }] // 永不过期（ttl: 0）
                    );
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已保存背景图缓存元数据: ${cacheKey}（永不过期）`);
                    }
                } catch (cacheError) {
                    // 缓存保存失败不影响图片保存，只记录警告
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '保存背景图缓存元数据失败', cacheError);
                    }
                }
                
                // 使用 ThemeManager 设置背景
                if (typeof ThemeManager !== 'undefined') {
                    const result = await ThemeManager.setLocalImageAsBackground(filePath, true);
                    
                    if (result) {
                        // 保存请求状态为成功
                        if (typeof LStorage !== 'undefined') {
                            try {
                                await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'success');
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ThemeAnimator', '保存请求状态失败', e);
                                }
                            }
                        }
                        
                        // 更新当前背景显示
                        const currentBackground = ThemeManager._desktopBackgrounds.get(ThemeManager._currentDesktopBackgroundId);
                        if (currentBackground) {
                            this._updateCurrentBackgroundDisplay({
                                id: currentBackground.id,
                                name: '随机二次元背景',
                                description: '来自 uapis.cn 的随机二次元图片'
                            });
                        }
                        
                        // 刷新背景图卡片列表，确保新加载的背景图显示在列表中
                        this._updateBackgroundsList();
                        
                        // 成功时不显示弹窗，静默完成
                    } else {
                        throw new Error('设置背景失败');
                    }
                } else {
                    throw new Error('ThemeManager 不可用');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '加载随机二次元背景失败', e);
                }
                
                // 保存请求状态为失败
                if (typeof LStorage !== 'undefined') {
                    try {
                        await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'failed');
                    } catch (storageError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '保存请求状态失败', storageError);
                        }
                    }
                }
                
                // 显示错误消息，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '加载失败',
                            content: `加载随机二次元背景失败: ${e.message}`,
                            duration: 4000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
            } finally {
                // 恢复按钮状态
                btn.disabled = false;
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                
                // 清除加载标志
                this._loadingRandomAnimeBg = false;
            }
        },
        
        /**
         * 取消随机二次元背景功能
         */
        _cancelRandomAnimeBackground: async function() {
            // 清除请求状态，禁用自动请求
            if (typeof LStorage !== 'undefined') {
                try {
                    await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'disabled');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '已禁用随机二次元背景功能');
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '保存禁用状态失败', e);
                    }
                }
            }
            
            // 更新所有随机背景图缓存的过期时间为30分钟
            try {
                await this._updateRandomAnimeBgCacheExpiration(30 * 60 * 1000); // 30分钟
            } catch (e) {
                // 更新缓存过期时间失败不影响功能禁用，只记录警告
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '更新背景图缓存过期时间失败', e);
                }
            }
            
            // 显示提示消息，使用通知提示（不打断用户）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    await NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: '主题管理器',
                        content: '已取消随机二次元背景功能。刷新时将不再自动请求。背景图将在30分钟后自动清理。',
                        duration: 4000
                    });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                    }
                }
            }
        },
        
        /**
         * 更新所有随机二次元背景图缓存的过期时间
         * @param {number} ttl 过期时间（毫秒）
         */
        _updateRandomAnimeBgCacheExpiration: async function(ttl) {
            if (typeof ProcessManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', 'ProcessManager 不可用，跳过更新缓存过期时间');
                }
                return;
            }
            
            try {
                // 直接读取缓存元数据文件，获取所有缓存键
                const cacheMetadataPath = 'D:/LocalCache.json';
                let cacheMetadata = null;
                
                try {
                    const readResult = await ProcessManager.callKernelAPI(
                        this.pid,
                        'FileSystem.read',
                        [cacheMetadataPath]
                    );
                    
                    if (readResult && readResult.status === 'success' && readResult.data && readResult.data.content) {
                        try {
                            cacheMetadata = JSON.parse(readResult.data.content);
                        } catch (parseError) {
                            // JSON 解析失败
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ThemeAnimator', '解析缓存元数据文件失败', parseError);
                            }
                            return;
                        }
                    } else {
                        // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                        return;
                    }
                } catch (readError) {
                    // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                    // 检查错误消息，如果是文件不存在，只记录调试信息
                    const errorMessage = readError?.message || readError?.toString() || '';
                    const isFileNotFound = errorMessage.includes('文件不存在') || 
                                         errorMessage.includes('不存在') ||
                                         errorMessage.includes('404') ||
                                         errorMessage.includes('Not Found');
                    
                    if (isFileNotFound) {
                        // 文件不存在是正常情况，只记录调试信息
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                    } else {
                        // 其他错误，记录警告
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取缓存元数据文件失败', readError);
                        }
                    }
                    return;
                }
                
                if (!cacheMetadata || !cacheMetadata.system || typeof cacheMetadata.system !== 'object') {
                    return;
                }
                
                // 查找所有 random_anime_bg 相关的缓存键
                const cacheKeys = Object.keys(cacheMetadata.system).filter(key => 
                    key.startsWith('random_anime_bg:')
                );
                
                if (cacheKeys.length === 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '没有找到需要更新的背景图缓存');
                    }
                    return;
                }
                
                let updatedCount = 0;
                
                // 更新每个缓存条目的过期时间
                for (const cacheKey of cacheKeys) {
                    try {
                        // 获取当前缓存值
                        const cacheValue = await ProcessManager.callKernelAPI(
                            this.pid,
                            'Cache.get',
                            [cacheKey, null]
                        );
                        
                        if (cacheValue) {
                            // 使用相同的值重新设置缓存，但更新过期时间
                            await ProcessManager.callKernelAPI(
                                this.pid,
                                'Cache.set',
                                [cacheKey, cacheValue, { ttl: ttl }]
                            );
                            updatedCount++;
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `已更新缓存过期时间: ${cacheKey}，过期时间: ${ttl}ms`);
                            }
                        }
                    } catch (e) {
                        // 单个缓存条目更新失败不影响其他条目
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `更新缓存条目 ${cacheKey} 失败`, e);
                        }
                    }
                }
                
                if (updatedCount > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('ThemeAnimator', `已更新 ${updatedCount} 个背景图缓存的过期时间为 ${ttl}ms`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '更新背景图缓存过期时间时出错', e);
                }
                throw e;
            }
        },
        
        /**
         * 清理旧的随机二次元背景图（通过 CacheDrive 管理）
         */
        _cleanupOldRandomAnimeBackgrounds: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', 'ProcessManager 不可用，跳过清理');
                    }
                    return;
                }
                
                // 直接读取缓存元数据文件，获取所有缓存键
                const cacheMetadataPath = 'D:/LocalCache.json';
                let cacheMetadata = null;
                
                try {
                    const readResult = await ProcessManager.callKernelAPI(
                        this.pid,
                        'FileSystem.read',
                        [cacheMetadataPath]
                    );
                    
                    if (readResult && readResult.status === 'success' && readResult.data && readResult.data.content) {
                        try {
                            cacheMetadata = JSON.parse(readResult.data.content);
                        } catch (parseError) {
                            // JSON 解析失败
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ThemeAnimator', '解析缓存元数据文件失败', parseError);
                            }
                            return;
                        }
                    } else {
                        // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                        return;
                    }
                } catch (readError) {
                    // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                    // 检查错误消息，如果是文件不存在，只记录调试信息
                    const errorMessage = readError?.message || readError?.toString() || '';
                    const isFileNotFound = errorMessage.includes('文件不存在') || 
                                         errorMessage.includes('不存在') ||
                                         errorMessage.includes('404') ||
                                         errorMessage.includes('Not Found');
                    
                    if (isFileNotFound) {
                        // 文件不存在是正常情况，只记录调试信息
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                    } else {
                        // 其他错误，记录警告
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取缓存元数据文件失败', readError);
                        }
                    }
                    return;
                }
                
                if (!cacheMetadata || !cacheMetadata.system || typeof cacheMetadata.system !== 'object') {
                    return;
                }
                
                // 查找所有 random_anime_bg 相关的缓存键
                const cacheKeys = Object.keys(cacheMetadata.system).filter(key => 
                    key.startsWith('random_anime_bg:')
                );
                
                if (cacheKeys.length === 0) {
                    return;
                }
                
                let cleanedCount = 0;
                
                // 检查每个缓存条目是否过期，如果过期则删除对应的文件
                for (const cacheKey of cacheKeys) {
                    try {
                        const cacheEntry = cacheMetadata.system[cacheKey];
                        if (!cacheEntry || !cacheEntry.value) {
                            // 缓存条目无效，直接删除
                            await ProcessManager.callKernelAPI(
                                this.pid,
                                'Cache.delete',
                                [cacheKey]
                            ).catch(() => {});
                            continue;
                        }
                        
                        const cacheValue = cacheEntry.value;
                        
                        // 检查缓存是否过期（使用 Cache.has 检查，它会自动检查过期时间）
                        const hasCache = await ProcessManager.callKernelAPI(
                            this.pid,
                            'Cache.has',
                            [cacheKey]
                        );
                        
                        if (!hasCache) {
                            // 缓存已过期或不存在，删除对应的文件
                            if (cacheValue && cacheValue.filePath) {
                                // 尝试删除文件
                                try {
                                    const deleteResult = await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'FileSystem.delete',
                                        [cacheValue.filePath]
                                    );
                                    
                                    if (deleteResult && deleteResult.status === 'success') {
                                        // 删除缓存元数据
                                        await ProcessManager.callKernelAPI(
                                            this.pid,
                                            'Cache.delete',
                                            [cacheKey]
                                        );
                                        cleanedCount++;
                                        
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.debug('ThemeAnimator', `已删除过期背景图: ${cacheValue.fileName || cacheKey}`);
                                        }
                                    }
                                } catch (deleteError) {
                                    // 文件删除失败，但删除缓存元数据
                                    await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'Cache.delete',
                                        [cacheKey]
                                    ).catch(() => {});
                                    
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `删除文件失败: ${cacheValue.filePath}`, deleteError);
                                    }
                                }
                            } else {
                                // 缓存值无效，直接删除缓存元数据
                                await ProcessManager.callKernelAPI(
                                    this.pid,
                                    'Cache.delete',
                                    [cacheKey]
                                ).catch(() => {});
                                
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('ThemeAnimator', `缓存值无效，已删除缓存元数据: ${cacheKey}`);
                                }
                            }
                        }
                    } catch (e) {
                        // 单个缓存条目处理失败不影响其他条目
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `处理缓存条目 ${cacheKey} 失败`, e);
                        }
                    }
                }
                
                if (cleanedCount > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已清理 ${cleanedCount} 个过期背景图文件`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '清理旧背景图时出错', e);
                }
                // 不抛出错误，允许继续执行
            }
        },
        
        /**
         * 删除背景（包括文件、缓存和注册表）
         * @param {Object} background 背景对象
         * @param {boolean} isRandomAnimeBg 是否是随机二次元背景图
         */
        _deleteBackground: async function(background, isRandomAnimeBg) {
            try {
                // 确认删除
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                    const confirmed = await GUIManager.showConfirm(
                        `确定要删除背景 "${background.name || background.id}" 吗？\n此操作将删除文件、缓存和注册表中的相关数据，且无法恢复。`,
                        '确认删除',
                        'danger'
                    );
                    if (!confirmed) {
                        return;
                    }
                } else {
                    if (!confirm(`确定要删除背景 "${background.name || background.id}" 吗？\n此操作将删除文件、缓存和注册表中的相关数据，且无法恢复。`)) {
                        return;
                    }
                }
                
                // 1. 如果当前正在使用该背景，先切换到默认背景
                const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (currentBackgroundId === background.id) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `当前正在使用该背景，切换到默认背景`);
                    }
                    await ProcessManager.setDesktopBackground('default', this.pid);
                }
                
                // 2. 删除文件
                if (background.path && (background.path.startsWith('C:') || background.path.startsWith('D:'))) {
                    try {
                        // 解析路径：分离父目录路径和文件名
                        const pathParts = background.path.split('/');
                        const fileName = pathParts[pathParts.length - 1];
                        const parentPath = pathParts.slice(0, -1).join('/') || (background.path.split(':')[0] + ':');
                        
                        // 确保路径格式正确
                        let phpPath = parentPath;
                        if (/^[CD]:$/.test(phpPath)) {
                            phpPath = phpPath + '/';
                        }
                        
                        const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                    ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                    : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                        ? SystemInformation.getOrigin()
                        : window.location.origin);
                        url.searchParams.set('action', 'delete_file');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('fileName', fileName);
                        
                        const response = await fetch(url.toString());
                        if (!response.ok) {
                            const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                            throw new Error(errorResult.message || `HTTP ${response.status}`);
                        }
                        
                        const result = await response.json();
                        if (result.status !== 'success') {
                            throw new Error(result.message || '删除文件失败');
                        }
                        
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `已删除背景文件: ${background.path}`);
                        }
                    } catch (fileError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除背景文件失败: ${fileError.message}`);
                        }
                        // 文件删除失败不影响后续操作，继续执行
                    }
                }
                
                // 3. 如果是随机二次元背景图，从 CacheDrive 删除缓存
                if (isRandomAnimeBg && background.path) {
                    try {
                        // 提取文件名
                        const fileName = background.path.split('/').pop() || '';
                        if (fileName) {
                            const cacheKey = `random_anime_bg:${fileName}`;
                            
                            if (typeof ProcessManager !== 'undefined') {
                                try {
                                    await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'Cache.delete',
                                        [cacheKey]
                                    );
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug('ThemeAnimator', `已删除缓存: ${cacheKey}`);
                                    }
                                } catch (cacheError) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `删除缓存失败: ${cacheError.message}`);
                                    }
                                    // 缓存删除失败不影响后续操作，继续执行
                                }
                            }
                        }
                    } catch (cacheError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除缓存时出错: ${cacheError.message}`);
                        }
                        // 缓存删除失败不影响后续操作，继续执行
                    }
                }
                
                // 4. 从 system.localDesktopBackgrounds 中删除
                if (typeof LStorage !== 'undefined') {
                    try {
                        let localBackgrounds = await LStorage.getSystemStorage('system.localDesktopBackgrounds');
                        if (Array.isArray(localBackgrounds)) {
                            const index = localBackgrounds.findIndex(bg => bg && bg.id === background.id);
                            if (index >= 0) {
                                localBackgrounds.splice(index, 1);
                                await LStorage.setSystemStorage('system.localDesktopBackgrounds', localBackgrounds);
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('ThemeAnimator', `已从注册表删除背景: ${background.id}`);
                                }
                            }
                        }
                    } catch (storageError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `从注册表删除背景失败: ${storageError.message}`);
                        }
                        // 注册表删除失败不影响后续操作，继续执行
                    }
                }
                
                // 5. 从 ThemeManager 的注册表中删除
                if (typeof ThemeManager !== 'undefined' && ThemeManager._desktopBackgrounds) {
                    try {
                        ThemeManager._desktopBackgrounds.delete(background.id);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `已从 ThemeManager 注册表删除背景: ${background.id}`);
                        }
                    } catch (themeError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `从 ThemeManager 注册表删除背景失败: ${themeError.message}`);
                        }
                        // ThemeManager 删除失败不影响后续操作，继续执行
                    }
                }
                
                // 6. 刷新背景列表
                this._updateBackgroundsList();
                
                // 7. 更新当前背景显示
                const newCurrentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (newCurrentBackgroundId) {
                    const newCurrentBackground = ProcessManager.getDesktopBackground(newCurrentBackgroundId, this.pid);
                    if (newCurrentBackground) {
                        this._updateCurrentBackgroundDisplay(newCurrentBackground);
                    }
                }
                
                // 删除成功，静默完成（不显示弹窗）
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '删除背景失败', error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`删除背景失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`删除背景失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 清理旧的随机二次元背景图（降级方案：直接操作文件系统）
         */
        _cleanupOldRandomAnimeBackgroundsFallback: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    return;
                }
                
                // 列出 D:/cache/ 目录下的所有文件
                const listResult = await ProcessManager.callKernelAPI(
                    this.pid,
                    'FileSystem.list',
                    ['D:/cache/']
                );
                
                if (!listResult || listResult.status !== 'success' || !Array.isArray(listResult.data)) {
                    return;
                }
                
                // 查找所有 random_anime_bg_*.jpg 文件
                const oldBackgroundFiles = listResult.data.filter(item => 
                    item.type === 'file' && 
                    item.name.startsWith('random_anime_bg_') && 
                    item.name.endsWith('.jpg')
                );
                
                // 删除所有旧的背景图文件
                for (const file of oldBackgroundFiles) {
                    try {
                        const filePath = `D:/cache/${file.name}`;
                        const deleteResult = await ProcessManager.callKernelAPI(
                            this.pid,
                            'FileSystem.delete',
                            [filePath]
                        );
                        
                        if (deleteResult && deleteResult.status === 'success') {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `已删除旧背景图: ${file.name}`);
                            }
                        }
                    } catch (e) {
                        // 单个文件删除失败不影响其他文件的删除
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除文件 ${file.name} 失败`, e);
                        }
                    }
                }
                
                if (oldBackgroundFiles.length > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已清理 ${oldBackgroundFiles.length} 个旧背景图文件`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '降级清理旧背景图时出错', e);
                }
            }
        }
    };
    
    // 导出到全局（通过POOL管理）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_POOL")) {
                POOL.__INIT__("APPLICATION_POOL");
            }
            POOL.__ADD__("APPLICATION_POOL", "THEMEANIMATOR", THEMEANIMATOR);
        } catch (e) {
            // 降级方案
            if (typeof window !== 'undefined') {
                window.THEMEANIMATOR = THEMEANIMATOR;
            }
        }
    } else {
        if (typeof window !== 'undefined') {
            window.THEMEANIMATOR = THEMEANIMATOR;
        }
    }
    
})(window);

