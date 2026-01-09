// ZerOS 音乐播放器
// 高仿网易云音乐风格的在线音乐播放器
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const MUSICPLAYER = {
        pid: null,
        window: null,
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        // 播放器状态
        _audio: null,
        _currentSong: null,
        _playlist: [],
        _currentIndex: -1,
        _isPlaying: false,
        _isLoading: false, // 是否正在加载音频
        _volume: 0.7,
        _lyrics: null,
        _currentLyricIndex: -1,
        _playMode: 'list', // 播放模式: 'list'(列表循环), 'single'(单曲循环), 'random'(随机播放)
        _networkManager: null, // NetworkManager 实例
        _isExiting: false, // 是否正在退出，用于防止退出后的操作
        _progressUpdateTimer: null, // 进度更新定时器
        
        // 收藏和歌单
        _favorites: [], // 收藏的歌曲ID列表
        _playlists: [], // 用户创建的歌单列表，格式: [{ id: 'playlist_xxx', name: '歌单名', songIds: [rid1, rid2, ...] }]
        
        // 歌曲信息缓存（保存歌名、歌词等，不保存URL和封面）
        _songInfoCache: {}, // 格式: { rid: { name, artist, album, lyrics } }
        
        // 分页状态
        _pagination: {
            currentPage: 1,
            pageSize: 30,
            total: 0,
            totalPages: 0,
            currentType: null, // 'search', 'rank', 'daily', 'artist', 'playlist', 'artistSongs'
            currentKeyword: null, // 搜索关键词
            currentArtistId: null // 当前歌手ID
        },
        
        // UI元素引用
        _leftSidebar: null,
        _mainContent: null,
        _playerBar: null,
        _searchInput: null,
        _searchResults: null,
        _playlistView: null,
        _lyricsView: null,
        _immersiveView: null,  // 沉浸式播放页面
        _isImmersiveMode: false,  // 是否处于沉浸式模式
        _desktopComponentId: null,  // 桌面组件ID
        _desktopComponent: null,  // 桌面组件元素引用
        _windowSize: { width: 0, height: 0 },  // 窗口大小
        _useNotification: false,  // 是否使用通知依赖（false=桌面组件，true=通知依赖）
        _notificationId: null,  // 通知ID（如果使用通知依赖）
        
        // API基础URL
        API_BASE: 'https://kw-api.cenguigui.cn',
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 获取 NetworkManager 实例
            this._initNetworkManager();
            
            // 初始化音频播放器
            this._initAudio();
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'musicplayer-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 1200px;
                height: 800px;
                min-width: 400px;
                min-height: 300px;
                max-width: 100vw;
                max-height: 100vh;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('musicplayer');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '音乐播放器',
                    icon: icon,
                    onClose: () => {
                        // 先执行清理
                        this._cleanup();
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    },
                    onMinimize: () => {
                        // 最小化回调
                    },
                    onMaximize: (isMaximized) => {
                        // 最大化/还原回调
                        if (isMaximized) {
                            // 最大化时，调整窗口样式以实现沉浸式体验
                            this.window.style.borderRadius = '0';
                            this.window.style.border = 'none';
                        } else {
                            // 还原时，恢复窗口样式
                            this.window.style.borderRadius = '';
                            this.window.style.border = '';
                        }
                    }
                });
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建主内容
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 加载用户设置
            await this._loadSettings();
            
            // 根据设置创建桌面组件或通知依赖
            if (this._useNotification) {
                this._createNotificationDependent();
            } else {
                this._createDesktopComponent();
            }
            
            // 监听窗口大小变化
            this._setupWindowSizeListener();
            
            // 加载默认内容（热门搜索）
            this._loadHotSearches();
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
                        KernelLogger.warn('MusicPlayer', '内存初始化失败', e);
                    }
                }
            }
        },
        
        _initNetworkManager: function() {
            // 获取 NetworkManager 实例
            if (typeof NetworkManager !== 'undefined') {
                this._networkManager = NetworkManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    this._networkManager = POOL.__GET__('KERNEL_GLOBAL_POOL', 'NetworkManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', '从 POOL 获取 NetworkManager 失败', e);
                    }
                }
            }
            
            if (!this._networkManager) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('MusicPlayer', 'NetworkManager 不可用，将使用原生 fetch');
                }
            }
        },
        
        _fetch: function(url, options = {}) {
            // 如果 NetworkManager 可用，使用它的 fetch 方法
            if (this._networkManager && typeof this._networkManager.fetch === 'function') {
                return this._networkManager.fetch(url, options);
            }
            // 否则使用原生 fetch
            return fetch(url, options);
        },
        
        _initAudio: function() {
            this._audio = new Audio();
            this._audio.volume = this._volume;
            
            // 播放事件
            this._audio.addEventListener('play', () => {
                // 如果程序正在退出，不处理播放事件
                if (this._isExiting) {
                    return;
                }
                this._isPlaying = true;
                this._updatePlayButton();
                // 更新通知中的播放状态
                if (this._useNotification) {
                    this._updateNotificationDependent();
                }
            });
            
            // 暂停事件
            this._audio.addEventListener('pause', () => {
                // 如果程序正在退出，不处理暂停事件
                if (this._isExiting) {
                    return;
                }
                this._isPlaying = false;
                this._updatePlayButton();
                // 更新通知中的播放状态
                if (this._useNotification) {
                    this._updateNotificationDependent();
                }
            });
            
            // 时间更新
            this._audio.addEventListener('timeupdate', () => {
                // 如果程序正在退出，不更新进度
                if (this._isExiting) {
                    return;
                }
                this._updateProgress();
                this._updateLyrics();
            });
            
            // 加载完成
            this._audio.addEventListener('loadedmetadata', () => {
                this._updateDuration();
            });
            
            // 播放结束
            this._audio.addEventListener('ended', () => {
                // 如果程序正在退出，不处理播放结束事件
                if (this._isExiting) {
                    return;
                }
                if (this._playMode === 'single') {
                    // 单曲循环：重新播放当前歌曲
                    this._audio.currentTime = 0;
                    this._audio.play().catch(e => {
                        // 忽略 AbortError
                        if (e.name !== 'AbortError' && !this._isExiting) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('MusicPlayer', '播放失败', e);
                            }
                        }
                    });
                } else {
                    // 其他模式：播放下一首
                    this._playNext();
                }
            });
            
            // 错误处理
            this._audio.addEventListener('error', (e) => {
                // 如果程序正在退出，不处理错误
                if (this._isExiting) {
                    return;
                }
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '播放错误', e);
                }
                this._showMessage('播放失败，请稍后重试');
            });
        },
        
        _createContent: function() {
            const container = document.createElement('div');
            container.className = 'musicplayer-container';
            container.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                background: #1e1e1e;
                color: #e0e0e0;
                overflow: hidden;
            `;
            
            // 顶部搜索栏
            const topBar = this._createTopBar();
            container.appendChild(topBar);
            
            // 主体区域
            const body = document.createElement('div');
            body.className = 'musicplayer-body';
            body.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
            `;
            
            // 左侧边栏
            this._leftSidebar = this._createLeftSidebar();
            body.appendChild(this._leftSidebar);
            
            // 主内容区（必须在侧边栏之后创建，因为侧边栏的点击事件需要访问这些元素）
            this._mainContent = this._createMainContent();
            body.appendChild(this._mainContent);
            
            container.appendChild(body);
            
            // 底部播放栏
            this._playerBar = this._createPlayerBar();
            container.appendChild(this._playerBar);
            
            // 创建沉浸式播放页面（初始隐藏）
            this._immersiveView = this._createImmersiveView();
            container.appendChild(this._immersiveView);
            
            // 在创建完所有元素后，默认选中"发现音乐"
            if (this._leftSidebar) {
                const discoverItem = this._leftSidebar.querySelector('[data-id="discover"]');
                if (discoverItem) {
                    discoverItem.click();
                }
            }
            
            return container;
        },
        
        _createTopBar: function() {
            const topBar = document.createElement('div');
            topBar.className = 'musicplayer-topbar';
            topBar.style.cssText = `
                height: 60px;
                background: #252525;
                border-bottom: 1px solid #333;
                display: flex;
                align-items: center;
                padding: 0 20px;
                gap: 20px;
            `;
            
            // 搜索框
            const searchContainer = document.createElement('div');
            searchContainer.style.cssText = `
                flex: 1;
                max-width: 500px;
                position: relative;
            `;
            
            this._searchInput = document.createElement('input');
            this._searchInput.type = 'text';
            this._searchInput.placeholder = '搜索歌曲、歌手、专辑...';
            this._searchInput.className = 'musicplayer-search-input';
            this._searchInput.style.cssText = `
                width: 100%;
                height: 36px;
                padding: 0 40px 0 15px;
                background: rgba(42, 42, 42, 0.8);
                border: 1px solid rgba(58, 58, 58, 0.6);
                border-radius: 18px;
                color: #e0e0e0;
                font-size: 14px;
                outline: none;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(10px);
            `;
            
            // 添加焦点动画
            this._searchInput.addEventListener('focus', () => {
                this._searchInput.style.background = 'rgba(58, 58, 58, 0.9)';
                this._searchInput.style.borderColor = '#ec4141';
                this._searchInput.style.boxShadow = '0 0 0 3px rgba(236, 65, 65, 0.2)';
                searchIcon.style.transform = 'translateY(-50%) scale(1.1)';
            });
            
            this._searchInput.addEventListener('blur', () => {
                this._searchInput.style.background = 'rgba(42, 42, 42, 0.8)';
                this._searchInput.style.borderColor = 'rgba(58, 58, 58, 0.6)';
                this._searchInput.style.boxShadow = 'none';
                searchIcon.style.transform = 'translateY(-50%) scale(1)';
            });
            
            this._searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this._performSearch();
                }
            });
            
            const searchIcon = document.createElement('div');
            searchIcon.innerHTML = '🔍';
            searchIcon.className = 'musicplayer-search-icon';
            searchIcon.style.cssText = `
                position: absolute;
                right: 15px;
                top: 50%;
                transform: translateY(-50%);
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                filter: brightness(0.8);
            `;
            searchIcon.addEventListener('mouseenter', () => {
                searchIcon.style.transform = 'translateY(-50%) scale(1.2)';
                searchIcon.style.filter = 'brightness(1.2)';
            });
            searchIcon.addEventListener('mouseleave', () => {
                if (document.activeElement !== this._searchInput) {
                    searchIcon.style.transform = 'translateY(-50%) scale(1)';
                    searchIcon.style.filter = 'brightness(0.8)';
                }
            });
            searchIcon.addEventListener('click', () => this._performSearch());
            
            searchContainer.appendChild(this._searchInput);
            searchContainer.appendChild(searchIcon);
            topBar.appendChild(searchContainer);
            
            return topBar;
        },
        
        _createLeftSidebar: function() {
            const sidebar = document.createElement('div');
            sidebar.className = 'musicplayer-sidebar';
            sidebar.style.cssText = `
                width: 200px;
                background: #1a1a1a;
                border-right: 1px solid #333;
                display: flex;
                flex-direction: column;
                padding: 20px 0;
            `;
            
            const menuItems = [
                { id: 'discover', label: '发现音乐', icon: '🎵' },
                { id: 'playlist', label: '推荐歌单', icon: '📋' },
                { id: 'rank', label: '排行榜', icon: '🏆' },
                { id: 'artist', label: '歌手', icon: '👤' },
                { id: 'daily', label: '每日推荐', icon: '⭐' },
                { id: 'myplaylist', label: '我的播放列表', icon: '🎶' },
                { id: 'favorites', label: '我的收藏', icon: '❤️' },
                { id: 'myplaylists', label: '我的歌单', icon: '📝' }
            ];
            
            menuItems.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.className = 'sidebar-menu-item';
                menuItem.dataset.id = item.id;
                menuItem.style.cssText = `
                    padding: 12px 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 14px;
                    transition: background 0.2s;
                `;
                menuItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
                
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = '#252525';
                });
                menuItem.addEventListener('mouseleave', () => {
                    if (!menuItem.classList.contains('active')) {
                        menuItem.style.background = 'transparent';
                    }
                });
                
                menuItem.addEventListener('click', () => {
                    document.querySelectorAll('.sidebar-menu-item').forEach(mi => {
                        mi.classList.remove('active');
                        mi.style.background = 'transparent';
                    });
                    menuItem.classList.add('active');
                    menuItem.style.background = '#2a2a2a';
                    this._handleMenuClick(item.id);
                });
                
                sidebar.appendChild(menuItem);
            });
            
            // 添加分隔线
            const divider = document.createElement('div');
            divider.style.cssText = `
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 10px 20px;
            `;
            sidebar.appendChild(divider);
            
            // 添加设置项
            const settingsItem = document.createElement('div');
            settingsItem.className = 'sidebar-menu-item';
            settingsItem.dataset.id = 'settings';
            settingsItem.style.cssText = `
                padding: 12px 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                transition: background 0.2s;
                margin-top: auto;
            `;
            settingsItem.innerHTML = `<span>⚙️</span><span>设置</span>`;
            
            settingsItem.addEventListener('mouseenter', () => {
                settingsItem.style.background = '#252525';
            });
            settingsItem.addEventListener('mouseleave', () => {
                if (!settingsItem.classList.contains('active')) {
                    settingsItem.style.background = 'transparent';
                }
            });
            
            settingsItem.addEventListener('click', () => {
                this._showSettings();
            });
            
            sidebar.appendChild(settingsItem);
            
            // 注意：不要在这里触发点击事件，因为 _searchResults 和 _defaultContent 可能还未创建
            // 点击事件将在 _createContent 方法的最后触发
            
            return sidebar;
        },
        
        _createMainContent: function() {
            const content = document.createElement('div');
            content.className = 'musicplayer-main';
            content.style.cssText = `
                flex: 1;
                overflow-y: auto;
                background: #1e1e1e;
                padding: 20px;
            `;
            
            // 搜索结果显示区域
            this._searchResults = document.createElement('div');
            this._searchResults.className = 'search-results';
            this._searchResults.style.display = 'none';
            content.appendChild(this._searchResults);
            
            // 默认内容区域
            this._defaultContent = document.createElement('div');
            this._defaultContent.className = 'default-content';
            content.appendChild(this._defaultContent);
            
            return content;
        },
        
        _createPlayerBar: function() {
            const playerBar = document.createElement('div');
            playerBar.className = 'musicplayer-playerbar';
            playerBar.style.cssText = `
                height: 80px;
                background: #252525;
                border-top: 1px solid #333;
                display: flex;
                align-items: center;
                padding: 0 20px;
                gap: 20px;
            `;
            
            // 专辑封面
            const cover = document.createElement('div');
            cover.className = 'player-cover';
            cover.style.cssText = `
                width: 60px;
                height: 60px;
                background: #2a2a2a;
                border-radius: 4px;
                overflow: hidden;
                flex-shrink: 0;
            `;
            cover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎵</div>';
            playerBar.appendChild(cover);
            this._playerCover = cover;
            
            // 歌曲信息
            const songInfo = document.createElement('div');
            songInfo.className = 'player-info';
            songInfo.style.cssText = `
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 5px;
            `;
            
            const songName = document.createElement('div');
            songName.className = 'player-song-name';
            songName.textContent = '未播放';
            songName.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: #e0e0e0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            
            const artistName = document.createElement('div');
            artistName.className = 'player-artist-name';
            artistName.textContent = '--';
            artistName.style.cssText = `
                font-size: 12px;
                color: #999;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            
            songInfo.appendChild(songName);
            songInfo.appendChild(artistName);
            playerBar.appendChild(songInfo);
            this._playerSongName = songName;
            this._playerArtistName = artistName;
            
            // 播放控制
            const controls = document.createElement('div');
            controls.className = 'player-controls';
            controls.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                flex: 1;
            `;
            
            // 控制按钮
            const controlButtons = document.createElement('div');
            controlButtons.style.cssText = `
                display: flex;
                align-items: center;
                gap: 15px;
            `;
            
            const prevBtn = this._createButton('⏮', () => this._playPrev());
            const playBtn = this._createButton('▶', () => this._togglePlay());
            playBtn.className = 'play-button';
            const nextBtn = this._createButton('⏭', () => this._playNext());
            
            // 播放模式切换按钮
            const modeBtn = this._createButton('🔁', () => this._togglePlayMode());
            modeBtn.className = 'play-mode-button';
            modeBtn.title = '列表循环';
            this._playModeButton = modeBtn;
            
            // 收藏按钮
            const favoriteBtn = this._createButton('🤍', async () => {
                if (this._currentSong && this._currentSong.rid) {
                    if (this._isFavorite(this._currentSong.rid)) {
                        await this._removeFromFavorites(this._currentSong.rid);
                    } else {
                        await this._addToFavorites(this._currentSong.rid);
                    }
                }
            });
            favoriteBtn.className = 'favorite-btn';
            favoriteBtn.title = '收藏';
            
            controlButtons.appendChild(prevBtn);
            controlButtons.appendChild(playBtn);
            controlButtons.appendChild(nextBtn);
            controlButtons.appendChild(modeBtn);
            controlButtons.appendChild(favoriteBtn);
            this._playButton = playBtn;
            
            // 进度条
            const progressContainer = document.createElement('div');
            progressContainer.style.cssText = `
                width: 100%;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            
            const timeCurrent = document.createElement('div');
            timeCurrent.className = 'time-current';
            timeCurrent.textContent = '00:00';
            timeCurrent.style.cssText = `
                font-size: 12px;
                color: #999;
                min-width: 40px;
            `;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.cssText = `
                flex: 1;
                height: 4px;
                background: #3a3a3a;
                border-radius: 2px;
                cursor: pointer;
                position: relative;
            `;
            
            const progressFill = document.createElement('div');
            progressFill.className = 'progress-fill';
            progressFill.style.cssText = `
                height: 100%;
                background: #ec4141;
                border-radius: 2px;
                width: 0%;
                transition: width 0.1s;
            `;
            progressBar.appendChild(progressFill);
            this._progressFill = progressFill;
            
            progressBar.addEventListener('click', (e) => {
                const rect = progressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                this._seekTo(percent);
            });
            
            const timeTotal = document.createElement('div');
            timeTotal.className = 'time-total';
            timeTotal.textContent = '00:00';
            timeTotal.style.cssText = `
                font-size: 12px;
                color: #999;
                min-width: 40px;
            `;
            this._timeCurrent = timeCurrent;
            this._timeTotal = timeTotal;
            
            progressContainer.appendChild(timeCurrent);
            progressContainer.appendChild(progressBar);
            progressContainer.appendChild(timeTotal);
            
            // 音量控制
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'volume-container';
            volumeContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 120px;
            `;
            
            const volumeIcon = this._createButton('🔊', () => {
                if (this._volume > 0) {
                    this._setVolume(0);
                } else {
                    this._setVolume(0.7);
                }
            });
            volumeIcon.style.cssText = `
                width: 32px;
                height: 32px;
                font-size: 16px;
                background: transparent;
                border: none;
                color: #999;
                cursor: pointer;
                padding: 0;
            `;
            this._volumeIcon = volumeIcon;
            
            const volumeBar = document.createElement('div');
            volumeBar.className = 'volume-bar';
            volumeBar.style.cssText = `
                flex: 1;
                height: 4px;
                background: #3a3a3a;
                border-radius: 2px;
                cursor: pointer;
                position: relative;
            `;
            
            const volumeFill = document.createElement('div');
            volumeFill.className = 'volume-fill';
            volumeFill.style.cssText = `
                height: 100%;
                background: #ec4141;
                border-radius: 2px;
                width: ${this._volume * 100}%;
                transition: width 0.1s;
            `;
            volumeBar.appendChild(volumeFill);
            this._volumeFill = volumeFill;
            
            volumeBar.addEventListener('click', (e) => {
                const rect = volumeBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                this._setVolume(percent);
            });
            
            volumeContainer.appendChild(volumeIcon);
            volumeContainer.appendChild(volumeBar);
            
            controls.appendChild(controlButtons);
            controls.appendChild(progressContainer);
            playerBar.appendChild(controls);
            playerBar.appendChild(volumeContainer);
            
            // 为播放栏添加点击事件，展开沉浸式播放页面
            playerBar.addEventListener('click', (e) => {
                // 如果点击的不是控制按钮，则展开沉浸式页面
                if (!e.target.closest('.player-controls') && !e.target.closest('.player-volume')) {
                    this._toggleImmersiveView();
                }
            });
            playerBar.style.cursor = 'pointer';
            
            return playerBar;
        },
        
        _createImmersiveView: function() {
            const immersiveView = document.createElement('div');
            immersiveView.className = 'immersive-player-view';
            
            // 背景装饰层
            const bgPattern = document.createElement('div');
            bgPattern.className = 'immersive-bg-pattern';
            immersiveView.appendChild(bgPattern);
            
            // 动态背景渐变（基于当前歌曲封面颜色）
            const bgGradient = document.createElement('div');
            bgGradient.className = 'immersive-bg-gradient';
            immersiveView.appendChild(bgGradient);
            
            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'immersive-close-btn';
            closeBtn.setAttribute('aria-label', '关闭沉浸式播放');
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleImmersiveView();
            });
            immersiveView.appendChild(closeBtn);
            
            // 主要内容区域
            const content = document.createElement('div');
            content.className = 'immersive-content';
            
            // 主布局容器
            const mainLayout = document.createElement('div');
            mainLayout.className = 'immersive-main-layout';
            
            // 左侧区域：封面和歌曲信息
            const leftSection = document.createElement('div');
            leftSection.className = 'immersive-left-section';
            
            // 专辑封面容器（磁盘层叠样式）
            const coverStack = document.createElement('div');
            coverStack.className = 'immersive-cover-stack';
            
            // 底层磁盘（不旋转）
            const coverLayer1 = document.createElement('div');
            coverLayer1.className = 'immersive-cover-layer immersive-cover-layer-1';
            const coverLayer1Inner = document.createElement('div');
            coverLayer1Inner.className = 'immersive-cover-inner';
            coverLayer1Inner.textContent = '🎵';
            coverLayer1.appendChild(coverLayer1Inner);
            
            // 中层磁盘（不旋转）
            const coverLayer2 = document.createElement('div');
            coverLayer2.className = 'immersive-cover-layer immersive-cover-layer-2';
            const coverLayer2Inner = document.createElement('div');
            coverLayer2Inner.className = 'immersive-cover-inner';
            coverLayer2Inner.textContent = '🎵';
            coverLayer2.appendChild(coverLayer2Inner);
            
            // 顶层磁盘（旋转）
            const coverLayer3 = document.createElement('div');
            coverLayer3.className = 'immersive-cover-layer immersive-cover-layer-3 immersive-cover-top';
            const coverLayer3Inner = document.createElement('div');
            coverLayer3Inner.className = 'immersive-cover-inner';
            coverLayer3Inner.textContent = '🎵';
            coverLayer3.appendChild(coverLayer3Inner);
            this._immersiveCover = coverLayer3;
            
            coverStack.appendChild(coverLayer1);
            coverStack.appendChild(coverLayer2);
            coverStack.appendChild(coverLayer3);
            this._immersiveCoverStack = coverStack;
            leftSection.appendChild(coverStack);
            
            // 歌曲信息
            const songInfo = document.createElement('div');
            songInfo.className = 'immersive-song-info';
            
            const songName = document.createElement('h1');
            songName.className = 'immersive-song-name';
            songName.textContent = '未播放';
            this._immersiveSongName = songName;
            
            const artistName = document.createElement('div');
            artistName.className = 'immersive-artist-name';
            artistName.textContent = '--';
            this._immersiveArtistName = artistName;
            
            // 当前播放歌曲标签
            const currentSongDisplay = document.createElement('div');
            currentSongDisplay.className = 'immersive-current-song';
            this._immersiveCurrentSong = currentSongDisplay;
            
            songInfo.appendChild(songName);
            songInfo.appendChild(artistName);
            songInfo.appendChild(currentSongDisplay);
            leftSection.appendChild(songInfo);
            
            // 右侧区域：歌词和词曲信息
            const rightSection = document.createElement('div');
            rightSection.className = 'immersive-right-section';
            
            // 歌词显示区域
            const lyricsContainer = document.createElement('div');
            lyricsContainer.className = 'immersive-lyrics';
            this._immersiveLyrics = lyricsContainer;
            rightSection.appendChild(lyricsContainer);
            
            // 词曲作者信息
            const creditsInfo = document.createElement('div');
            creditsInfo.className = 'immersive-credits';
            this._immersiveCredits = creditsInfo;
            rightSection.appendChild(creditsInfo);
            
            mainLayout.appendChild(leftSection);
            mainLayout.appendChild(rightSection);
            content.appendChild(mainLayout);
            
            // 播放控制区域（底部固定）
            const controls = document.createElement('div');
            controls.className = 'immersive-controls';
            
            // 进度条容器
            const progressContainer = document.createElement('div');
            progressContainer.className = 'immersive-progress-container';
            
            const timeCurrent = document.createElement('time');
            timeCurrent.className = 'immersive-time immersive-time-current';
            timeCurrent.textContent = '00:00';
            this._immersiveTimeCurrent = timeCurrent;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'immersive-progress-bar';
            progressBar.setAttribute('role', 'slider');
            progressBar.setAttribute('aria-label', '播放进度');
            progressBar.setAttribute('tabindex', '0');
            
            const progressFill = document.createElement('div');
            progressFill.className = 'immersive-progress-fill';
            const progressHandle = document.createElement('div');
            progressHandle.className = 'immersive-progress-handle';
            progressFill.appendChild(progressHandle);
            progressBar.appendChild(progressFill);
            this._immersiveProgressFill = progressFill;
            
            // 进度条交互
            let isDragging = false;
            progressBar.addEventListener('click', (e) => {
                if (isDragging) return;
                const rect = progressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                this._seekTo(percent);
            });
            
            progressBar.addEventListener('mousedown', (e) => {
                isDragging = true;
                const rect = progressBar.getBoundingClientRect();
                const updateProgress = (e) => {
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    this._seekTo(percent);
                };
                const handleMouseMove = (e) => updateProgress(e);
                const handleMouseUp = () => {
                    isDragging = false;
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                updateProgress(e);
            });
            
            const timeTotal = document.createElement('time');
            timeTotal.className = 'immersive-time immersive-time-total';
            timeTotal.textContent = '00:00';
            this._immersiveTimeTotal = timeTotal;
            
            progressContainer.appendChild(timeCurrent);
            progressContainer.appendChild(progressBar);
            progressContainer.appendChild(timeTotal);
            
            // 控制按钮容器
            const controlButtons = document.createElement('div');
            controlButtons.className = 'immersive-control-buttons';
            
            const prevBtn = this._createImmersiveButton('prev', '⏮', () => this._playPrev());
            prevBtn.className = 'immersive-control-btn immersive-prev-btn';
            
            const playBtn = this._createImmersiveButton('play', '▶', () => this._togglePlay());
            playBtn.className = 'immersive-control-btn immersive-play-button';
            this._immersivePlayButton = playBtn;
            
            const nextBtn = this._createImmersiveButton('next', '⏭', () => this._playNext());
            nextBtn.className = 'immersive-control-btn immersive-next-btn';
            
            controlButtons.appendChild(prevBtn);
            controlButtons.appendChild(playBtn);
            controlButtons.appendChild(nextBtn);
            
            controls.appendChild(progressContainer);
            controls.appendChild(controlButtons);
            content.appendChild(controls);
            
            immersiveView.appendChild(content);
            
            return immersiveView;
        },
        
        _createImmersiveButton: function(action, text, onClick) {
            const btn = document.createElement('button');
            btn.className = 'immersive-control-btn';
            btn.setAttribute('aria-label', action);
            btn.textContent = text;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
            return btn;
        },
        
        _toggleImmersiveView: function() {
            if (!this._immersiveView) return;
            
            this._isImmersiveMode = !this._isImmersiveMode;
            
            if (this._isImmersiveMode) {
                this._immersiveView.classList.add('active');
                // 更新窗口大小（确保布局正确）
                this._updateWindowSize();
                // 更新沉浸式页面的布局（根据宽高比）
                this._updateImmersiveViewLayout();
                // 更新沉浸式页面的内容
                this._updateImmersiveView();
            } else {
                this._immersiveView.classList.remove('active');
            }
        },
        
        _updateImmersiveView: function() {
            if (!this._currentSong) return;
            
            // 更新歌曲信息
            if (this._immersiveSongName) {
                this._immersiveSongName.textContent = this._currentSong.name || '未播放';
            }
            if (this._immersiveArtistName) {
                this._immersiveArtistName.textContent = this._currentSong.artist || '--';
            }
            
            // 更新当前播放歌曲显示
            if (this._immersiveCurrentSong) {
                const songText = `${this._currentSong.name || '未播放'} - ${this._currentSong.artist || '--'}`;
                this._immersiveCurrentSong.textContent = songText;
            }
            
            // 更新封面（所有层）
            if (this._immersiveCoverStack) {
                const layers = this._immersiveCoverStack.querySelectorAll('.immersive-cover-layer');
                const coverImg = this._currentSong.pic;
                
                layers.forEach((layer, index) => {
                    if (coverImg) {
                        layer.innerHTML = `<img src="${coverImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                    } else {
                        const emojiSize = index === 0 ? '100px' : (index === 1 ? '110px' : '120px');
                        layer.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${emojiSize};">🎵</div>`;
                    }
                });
                
                // 如果正在播放，顶层添加旋转动画
                if (this._immersiveCover) {
                    if (this._isPlaying) {
                        this._immersiveCover.classList.add('playing');
                    } else {
                        this._immersiveCover.classList.remove('playing');
                    }
                }
            }
            
            // 更新歌词
            this._updateImmersiveLyrics();
            
            // 更新词曲作者信息
            this._updateImmersiveCredits();
            
            // 更新播放按钮
            if (this._immersivePlayButton) {
                this._immersivePlayButton.textContent = this._isPlaying ? '⏸' : '▶';
            }
        },
        
        _updateImmersiveCredits: function() {
            if (!this._immersiveCredits || !this._currentSong) return;
            
            // 从歌词数据中提取词曲作者信息
            let lyricist = '未知';
            let composer = '未知';
            
            if (this._lyrics && this._lyrics.length > 0) {
                // 查找包含词曲信息的歌词行
                for (const lyric of this._lyrics) {
                    const text = lyric.text || '';
                    if (text.includes('词:')) {
                        const match = text.match(/词[：:]\s*([^曲]+)/);
                        if (match) {
                            lyricist = match[1].trim();
                        }
                    }
                    if (text.includes('曲:')) {
                        const match = text.match(/曲[：:]\s*(.+)/);
                        if (match) {
                            composer = match[1].trim();
                        }
                    }
                }
            }
            
            // 如果歌词中没有找到，尝试从歌曲数据中获取
            if (lyricist === '未知' && this._currentSong.lyricist) {
                lyricist = this._currentSong.lyricist;
            }
            if (composer === '未知' && this._currentSong.composer) {
                composer = this._currentSong.composer;
            }
            
            const creditsHTML = `
                <div style="color: rgba(255, 255, 255, 0.9); margin-bottom: 4px; font-weight: 500;">词: ${lyricist}</div>
                <div style="color: rgba(255, 255, 255, 0.7);">曲: ${composer}</div>
            `;
            
            this._immersiveCredits.innerHTML = creditsHTML;
        },
        
        _updateImmersiveLyrics: function() {
            if (!this._immersiveLyrics) return;
            
            if (!this._lyrics || this._lyrics.length === 0) {
                this._immersiveLyrics.innerHTML = '<div class="immersive-lyrics-empty">暂无歌词</div>';
                return;
            }
            
            // 过滤掉词曲信息行（通常包含"词:"或"曲:"）
            const filteredLyrics = this._lyrics.filter(lyric => {
                const text = lyric.text || '';
                return !text.includes('词:') && !text.includes('曲:') && text.trim().length > 0;
            });
            
            // 显示所有歌词，高亮当前行
            this._immersiveLyrics.innerHTML = filteredLyrics.map((lyric) => {
                // 找到原始索引
                const originalIndex = this._lyrics.indexOf(lyric);
                const isActive = originalIndex === this._currentLyricIndex;
                return `
                    <div class="lyric-line ${isActive ? 'active' : ''}" data-index="${originalIndex}">
                        ${lyric.text || ''}
                    </div>
                `;
            }).join('');
            
            // 滚动到当前歌词（延迟执行，确保DOM已更新）
            if (this._currentLyricIndex >= 0) {
                setTimeout(() => {
                    const activeLine = this._immersiveLyrics.querySelector(`.lyric-line[data-index="${this._currentLyricIndex}"]`);
                    if (activeLine) {
                        // 计算滚动位置，使当前歌词居中显示
                        const container = this._immersiveLyrics;
                        const containerHeight = container.clientHeight;
                        const lineHeight = activeLine.offsetHeight;
                        const lineTop = activeLine.offsetTop;
                        const scrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);
                        
                        container.scrollTo({
                            top: Math.max(0, scrollTop),
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            }
        },
        
        _createButton: function(text, onClick) {
            const btn = document.createElement('div');
            btn.textContent = text;
            btn.className = 'musicplayer-control-btn';
            btn.style.cssText = `
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 50%;
                font-size: 18px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                background: rgba(58, 58, 58, 0.3);
                color: #e0e0e0;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(236, 65, 65, 0.3)';
                btn.style.transform = 'scale(1.1)';
                btn.style.color = '#ec4141';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(58, 58, 58, 0.3)';
                btn.style.transform = 'scale(1)';
                btn.style.color = '#e0e0e0';
            });
            btn.addEventListener('click', (e) => {
                btn.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    btn.style.transform = 'scale(1)';
                }, 100);
                onClick(e);
            });
            return btn;
        },
        
        _handleMenuClick: function(menuId) {
            // 确保元素已创建
            if (!this._searchResults || !this._defaultContent) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('MusicPlayer', '_searchResults 或 _defaultContent 未创建，跳过菜单点击处理');
                }
                return;
            }
            
            this._searchResults.style.display = 'none';
            this._defaultContent.style.display = 'block';
            this._defaultContent.innerHTML = '';
            
            switch(menuId) {
                case 'discover':
                    this._loadHotSearches();
                    break;
                case 'playlist':
                    this._loadPlaylists();
                    break;
                case 'rank':
                    this._loadRankList();
                    break;
                case 'artist':
                    this._loadArtists();
                    break;
                case 'daily':
                    this._loadDailyRecommend();
                    break;
                case 'myplaylist':
                    this._loadMyPlaylist();
                    break;
                case 'favorites':
                    this._loadFavorites();
                    break;
                case 'myplaylists':
                    this._loadPlaylistsView();
                    break;
            }
        },
        
        _loadMyPlaylist: function() {
            if (this._playlist.length === 0) {
                this._defaultContent.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🎵</div>
                        <div style="font-size: 16px; margin-bottom: 10px;">播放列表为空</div>
                        <div style="font-size: 14px; color: #666;">播放歌曲后，它们会自动添加到播放列表</div>
                    </div>
                `;
                return;
            }
            
            this._defaultContent.innerHTML = `
                <div style="padding: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-size: 20px; color: #e0e0e0;">我的播放列表</h2>
                        <div style="display: flex; gap: 10px;">
                            <button class="playlist-action-btn" data-action="clear" style="
                                padding: 8px 16px;
                                background: rgba(236, 65, 65, 0.2);
                                border: 1px solid rgba(236, 65, 65, 0.3);
                                border-radius: 6px;
                                color: #ec4141;
                                cursor: pointer;
                                font-size: 14px;
                                transition: all 0.2s;
                            ">清空列表</button>
                            <button class="playlist-action-btn" data-action="playall" style="
                                padding: 8px 16px;
                                background: rgba(236, 65, 65, 0.3);
                                border: 1px solid rgba(236, 65, 65, 0.4);
                                border-radius: 6px;
                                color: #fff;
                                cursor: pointer;
                                font-size: 14px;
                                transition: all 0.2s;
                            ">播放全部</button>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${this._playlist.map((song, index) => `
                            <div class="playlist-item" data-index="${index}" data-rid="${song.rid}" style="
                                display: flex;
                                align-items: center;
                                gap: 12px;
                                padding: 12px;
                                background: ${index === this._currentIndex ? 'rgba(236, 65, 65, 0.15)' : 'transparent'};
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                border: ${index === this._currentIndex ? '1px solid rgba(236, 65, 65, 0.3)' : '1px solid transparent'};
                            ">
                                <div style="
                                    width: 50px;
                                    height: 50px;
                                    background: #2a2a2a;
                                    border-radius: 6px;
                                    overflow: hidden;
                                    flex-shrink: 0;
                                ">
                                    ${song.pic ? `<img src="${song.pic}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;">🎵</div>'}
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; color: ${index === this._currentIndex ? '#ec4141' : '#e0e0e0'}; font-weight: ${index === this._currentIndex ? '600' : '400'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        ${song.name || '未知歌曲'}
                                    </div>
                                    <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        ${song.artist || '未知艺术家'}
                                    </div>
                                </div>
                                <div style="
                                    width: 32px;
                                    height: 32px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: #999;
                                    font-size: 18px;
                                    cursor: pointer;
                                    opacity: 0;
                                    transition: all 0.2s;
                                " class="playlist-remove-btn" data-index="${index}">🗑️</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            // 绑定点击事件
            this._defaultContent.querySelectorAll('.playlist-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('playlist-remove-btn')) {
                        return; // 删除按钮的点击事件单独处理
                    }
                    const index = parseInt(item.dataset.index);
                    this._currentIndex = index;
                    this._playSong(this._playlist[index]);
                    this._loadMyPlaylist(); // 刷新列表以更新高亮
                });
                
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#2a2a2a';
                    const removeBtn = item.querySelector('.playlist-remove-btn');
                    if (removeBtn) {
                        removeBtn.style.opacity = '1';
                    }
                });
                
                item.addEventListener('mouseleave', () => {
                    const index = parseInt(item.dataset.index);
                    item.style.background = index === this._currentIndex ? 'rgba(236, 65, 65, 0.15)' : 'transparent';
                    const removeBtn = item.querySelector('.playlist-remove-btn');
                    if (removeBtn) {
                        removeBtn.style.opacity = '0';
                    }
                });
            });
            
            // 绑定删除按钮事件
            this._defaultContent.querySelectorAll('.playlist-remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);
                    if (index === this._currentIndex && this._isPlaying) {
                        this._audio.pause();
                        this._isPlaying = false;
                    }
                    this._playlist.splice(index, 1);
                    if (this._currentIndex >= index) {
                        this._currentIndex = Math.max(0, this._currentIndex - 1);
                    }
                    if (this._currentIndex >= this._playlist.length) {
                        this._currentIndex = this._playlist.length - 1;
                    }
                    this._loadMyPlaylist();
                });
            });
            
            // 绑定操作按钮事件
            this._defaultContent.querySelectorAll('.playlist-action-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    if (action === 'clear') {
                        if (confirm('确定要清空播放列表吗？')) {
                            this._playlist = [];
                            this._currentIndex = -1;
                            this._currentSong = null;
                            if (this._audio) {
                                this._audio.pause();
                                this._audio.src = '';
                            }
                            this._isPlaying = false;
                            this._updatePlayButton();
                            this._loadMyPlaylist();
                        }
                    } else if (action === 'playall') {
                        if (this._playlist.length > 0) {
                            this._currentIndex = 0;
                            this._playSong(this._playlist[0]);
                        }
                    }
                });
                
                btn.addEventListener('mouseenter', () => {
                    btn.style.opacity = '0.8';
                    btn.style.transform = 'scale(1.05)';
                });
                
                btn.addEventListener('mouseleave', () => {
                    btn.style.opacity = '1';
                    btn.style.transform = 'scale(1)';
                });
            });
        },
        
        async _loadHotSearches() {
            try {
                const response = await this._fetch(`${this.API_BASE}?type=searchKey`);
                const data = await response.json();
                
                if (data.code === 200 && data.data && data.data.hots) {
                    const hots = data.data.hots;
                    this._defaultContent.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0; animation: fadeInUp 0.5s ease;">热门搜索</h2>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                            ${hots.map((item, index) => `
                                <div class="hot-search-item" data-keyword="${item.name}" style="animation: fadeInUp 0.5s ease ${index * 0.05}s both;">${item.name}</div>
                            `).join('')}
                        </div>
                    `;
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.hot-search-item').forEach(item => {
                        item.addEventListener('click', () => {
                            this._searchInput.value = item.dataset.keyword;
                            this._performSearch();
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#3a3a3a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = '#2a2a2a';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载热门搜索失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _loadPlaylists(page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'playlist';
                
                const response = await this._fetch(`${this.API_BASE}?type=new&page=${page}&limit=${this._pagination.pageSize}`);
                const data = await response.json();
                
                if (data.code === 200 && data.data) {
                    const playlists = Array.isArray(data.data) ? data.data : [];
                    
                    // 更新分页信息
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        this._pagination.totalPages = playlists.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    const paginationHtml = this._createPaginationHTML('playlist', page);
                    
                    this._defaultContent.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">精选歌单</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px;">
                            ${playlists.map(playlist => `
                                <div class="playlist-item" data-id="${playlist.rid}" style="
                                    cursor: pointer;
                                    transition: transform 0.2s;
                                ">
                                    <img src="${playlist.pic}" style="
                                        width: 100%;
                                        aspect-ratio: 1;
                                        border-radius: 8px;
                                        object-fit: cover;
                                    " onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div style="display: none; width: 100%; aspect-ratio: 1; background: #2a2a2a; border-radius: 8px; align-items: center; justify-content: center; font-size: 48px;">🎵</div>
                                    <div style="margin-top: 8px; font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${playlist.name}</div>
                                    <div style="font-size: 12px; color: #999; margin-top: 4px;">${playlist.artist}</div>
                                </div>
                            `).join('')}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('playlist');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.playlist-item').forEach(item => {
                        item.addEventListener('click', () => {
                            this._loadPlaylistDetail(item.dataset.id);
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.transform = 'translateY(-5px)';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.transform = 'translateY(0)';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌单失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _loadRankList(page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'rank';
                
                const response = await this._fetch(`${this.API_BASE}?name=热歌榜&type=rank&page=${page}&limit=${this._pagination.pageSize}`);
                const data = await response.json();
                
                if (data.code === 200 && data.data && data.data.musicList) {
                    const songs = data.data.musicList;
                    
                    // 更新分页信息
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        this._pagination.totalPages = songs.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    // 计算实际排名（考虑分页）
                    const startRank = (page - 1) * this._pagination.pageSize;
                    
                    const paginationHtml = this._createPaginationHTML('rank', page);
                    
                    this._defaultContent.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">热歌榜</h2>
                        <div class="rank-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                            ${songs.map((song, index) => {
                                const rank = startRank + index + 1;
                                return `
                                <div class="rank-item" data-rid="${song.rid}" style="
                                    display: flex;
                                    align-items: center;
                                    padding: 12px 20px;
                                    border-bottom: 1px solid #333;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">
                                    <div style="width: 40px; text-align: center; font-size: 16px; font-weight: bold; color: ${rank <= 3 ? '#ec4141' : '#999'};">
                                        ${rank}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                        <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist} - ${song.album}</div>
                                    </div>
                                </div>
                            `;
                            }).join('')}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('rank');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.rank-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                            const rid = item.dataset.rid;
                            // 从原始数据中获取歌曲信息（更可靠）
                            const songData = songs[index];
                            if (songData) {
                                const song = {
                                    rid: songData.rid || rid,
                                    name: songData.name || '未知歌曲',
                                    artist: songData.artist || '未知艺术家',
                                    pic: songData.pic || '',
                                    url: `${this.API_BASE}?id=${songData.rid || rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${songData.rid || rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            } else {
                                // 如果原始数据不可用，从DOM提取（备用方案）
                                const nameEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 14px"]');
                                const artistEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 12px"]');
                                
                                const song = {
                                    rid: rid,
                                    name: nameEl ? nameEl.textContent.trim() : '未知歌曲',
                                    artist: artistEl ? artistEl.textContent.trim().split(' - ')[0] : '未知艺术家',
                                    pic: '',
                                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            }
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#2a2a2a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = 'transparent';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载排行榜失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _loadArtists(page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'artist';
                
                const response = await this._fetch(`${this.API_BASE}?type=artist&page=${page}&limit=${this._pagination.pageSize}`);
                const data = await response.json();
                
                if (data.code === 200 && data.data) {
                    const artists = Array.isArray(data.data) ? data.data : [];
                    
                    // 更新分页信息
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        this._pagination.totalPages = artists.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    const paginationHtml = this._createPaginationHTML('artist', page);
                    
                    this._defaultContent.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">热门歌手</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 20px;">
                            ${artists.map(artist => `
                                <div class="artist-item" data-id="${artist.rid}" style="
                                    cursor: pointer;
                                    text-align: center;
                                    transition: transform 0.2s;
                                ">
                                    <img src="${artist.pic}" style="
                                        width: 120px;
                                        height: 120px;
                                        border-radius: 50%;
                                        object-fit: cover;
                                        margin: 0 auto;
                                    " onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div style="display: none; width: 120px; height: 120px; background: #2a2a2a; border-radius: 50%; margin: 0 auto; align-items: center; justify-content: center; font-size: 48px;">👤</div>
                                    <div style="margin-top: 12px; font-size: 14px; color: #e0e0e0;">${artist.name}</div>
                                    <div style="font-size: 12px; color: #999; margin-top: 4px;">${artist.artistFans || 0} 粉丝</div>
                                </div>
                            `).join('')}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('artist');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.artist-item').forEach(item => {
                        item.addEventListener('click', () => {
                            this._loadArtistSongs(item.dataset.id);
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.transform = 'translateY(-5px)';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.transform = 'translateY(0)';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌手失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _loadDailyRecommend(page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'daily';
                
                const response = await this._fetch(`${this.API_BASE}?type=daily30&page=${page}&limit=${this._pagination.pageSize}`);
                const data = await response.json();
                
                if (data.code === 200 && data.data && data.data.musicList) {
                    const songs = data.data.musicList;
                    
                    // 更新分页信息
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        this._pagination.totalPages = songs.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    const paginationHtml = this._createPaginationHTML('daily', page);
                    
                    this._defaultContent.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">每日30首</h2>
                        <div class="daily-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                            ${songs.map((song, index) => `
                                <div class="daily-item" data-rid="${song.rid}" style="
                                    display: flex;
                                    align-items: center;
                                    padding: 12px 20px;
                                    border-bottom: 1px solid #333;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">
                                    <img src="${song.pic}" style="
                                        width: 50px;
                                        height: 50px;
                                        border-radius: 4px;
                                        object-fit: cover;
                                        margin-right: 15px;
                                    " onerror="this.style.display='none';">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                        <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist} - ${song.album}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('daily');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.daily-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                            const rid = item.dataset.rid;
                            // 从原始数据中获取歌曲信息（更可靠）
                            const songData = songs[index];
                            if (songData) {
                                const song = {
                                    rid: songData.rid || rid,
                                    name: songData.name || '未知歌曲',
                                    artist: songData.artist || '未知艺术家',
                                    pic: songData.pic || '',
                                    url: `${this.API_BASE}?id=${songData.rid || rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${songData.rid || rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            } else {
                                // 如果原始数据不可用，从DOM提取（备用方案）
                                const nameEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 14px"]');
                                const artistEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 12px"]');
                                const imgEl = item.querySelector('img');
                                
                                const song = {
                                    rid: rid,
                                    name: nameEl ? nameEl.textContent.trim() : '未知歌曲',
                                    artist: artistEl ? artistEl.textContent.trim().split(' - ')[0] : '未知艺术家',
                                    pic: imgEl && imgEl.src ? imgEl.src : '',
                                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            }
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#2a2a2a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = 'transparent';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载每日推荐失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _performSearch(page = 1) {
            const keyword = this._searchInput.value.trim();
            if (!keyword) return;
            
            try {
                this._showMessage('搜索中...');
                
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'search';
                this._pagination.currentKeyword = keyword;
                
                const response = await this._fetch(`${this.API_BASE}?name=${encodeURIComponent(keyword)}&page=${page}&limit=${this._pagination.pageSize}`);
                const data = await response.json();
                
                if (data.code === 200 && data.data) {
                    const songs = Array.isArray(data.data) ? data.data : [];
                    
                    // 更新分页信息（如果API返回了总数）
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        // 如果没有总数，根据当前页数据估算
                        this._pagination.totalPages = songs.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    this._searchResults.style.display = 'block';
                    this._defaultContent.style.display = 'none';
                    
                    // 创建分页容器
                    const paginationHtml = this._createPaginationHTML('search', page);
                    
                    this._searchResults.innerHTML = `
                        <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">搜索结果: "${keyword}"</h2>
                        <div class="search-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                            ${songs.length > 0 ? songs.map((song, index) => `
                                <div class="search-item" data-rid="${song.rid}" style="
                                    display: flex;
                                    align-items: center;
                                    padding: 12px 20px;
                                    border-bottom: 1px solid #333;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">
                                    <img src="${song.pic}" style="
                                        width: 50px;
                                        height: 50px;
                                        border-radius: 4px;
                                        object-fit: cover;
                                        margin-right: 15px;
                                    " onerror="this.style.display='none';">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                        <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist} - ${song.album}</div>
                                    </div>
                                </div>
                            `).join('') : '<div style="padding: 40px; text-align: center; color: #999;">未找到相关歌曲</div>'}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('search');
                    
                    // 绑定点击事件
                    this._searchResults.querySelectorAll('.search-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                            const rid = item.dataset.rid;
                            // 从原始数据中获取歌曲信息（更可靠）
                            const songData = songs[index];
                            if (songData) {
                                const song = {
                                    rid: songData.rid || rid,
                                    name: songData.name || '未知歌曲',
                                    artist: songData.artist || '未知艺术家',
                                    pic: songData.pic || '',
                                    url: `${this.API_BASE}?id=${songData.rid || rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${songData.rid || rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            } else {
                                // 如果原始数据不可用，从DOM提取（备用方案）
                                const nameEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 14px"]');
                                const artistEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 12px"]');
                                const imgEl = item.querySelector('img');
                                
                                const song = {
                                    rid: rid,
                                    name: nameEl ? nameEl.textContent.trim() : '未知歌曲',
                                    artist: artistEl ? artistEl.textContent.trim().split(' - ')[0] : '未知艺术家',
                                    pic: imgEl && imgEl.src ? imgEl.src : '',
                                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            }
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#2a2a2a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = 'transparent';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '搜索失败', e);
                }
                this._showMessage('搜索失败，请稍后重试');
            }
        },
        
        /**
         * 创建分页UI
         */
        _createPaginationHTML: function(type, currentPage) {
            const pag = this._pagination;
            const totalPages = pag.totalPages || 1;
            
            if (totalPages <= 1) {
                return ''; // 只有一页，不显示分页
            }
            
            const prevDisabled = currentPage <= 1;
            const nextDisabled = currentPage >= totalPages;
            
            return `
                <div class="pagination-container" data-pagination-type="${type}" style="
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 8px;
                    margin-top: 20px;
                    padding: 16px;
                ">
                    <button class="pagination-btn" data-action="prev" ${prevDisabled ? 'disabled' : ''} style="
                        padding: 8px 16px;
                        background: ${prevDisabled ? '#1a1a1a' : '#2a2a2a'};
                        border: 1px solid ${prevDisabled ? '#333' : '#444'};
                        border-radius: 4px;
                        color: ${prevDisabled ? '#666' : '#e0e0e0'};
                        cursor: ${prevDisabled ? 'not-allowed' : 'pointer'};
                        font-size: 14px;
                        transition: all 0.2s;
                    ">上一页</button>
                    
                    <div style="
                        display: flex;
                        gap: 4px;
                        align-items: center;
                    ">
                        ${this._generatePageNumbers(currentPage, totalPages, type)}
                    </div>
                    
                    <button class="pagination-btn" data-action="next" ${nextDisabled ? 'disabled' : ''} style="
                        padding: 8px 16px;
                        background: ${nextDisabled ? '#1a1a1a' : '#2a2a2a'};
                        border: 1px solid ${nextDisabled ? '#333' : '#444'};
                        border-radius: 4px;
                        color: ${nextDisabled ? '#666' : '#e0e0e0'};
                        cursor: ${nextDisabled ? 'not-allowed' : 'pointer'};
                        font-size: 14px;
                        transition: all 0.2s;
                    ">下一页</button>
                    
                    <div style="
                        margin-left: 16px;
                        font-size: 14px;
                        color: #999;
                    ">
                        第 ${currentPage} / ${totalPages} 页
                    </div>
                </div>
            `;
        },
        
        /**
         * 生成页码按钮
         */
        _generatePageNumbers: function(currentPage, totalPages, type) {
            const pages = [];
            const maxVisible = 7; // 最多显示7个页码
            
            let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            
            if (endPage - startPage < maxVisible - 1) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }
            
            // 第一页
            if (startPage > 1) {
                pages.push(`<button class="pagination-page" data-page="1" data-pagination-type="${type}" style="
                    padding: 8px 12px;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    color: #e0e0e0;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                ">1</button>`);
                if (startPage > 2) {
                    pages.push(`<span style="color: #666; padding: 0 4px;">...</span>`);
                }
            }
            
            // 中间页码
            for (let i = startPage; i <= endPage; i++) {
                const isActive = i === currentPage;
                pages.push(`<button class="pagination-page" data-page="${i}" data-pagination-type="${type}" style="
                    padding: 8px 12px;
                    background: ${isActive ? '#ec4141' : '#2a2a2a'};
                    border: 1px solid ${isActive ? '#ec4141' : '#444'};
                    border-radius: 4px;
                    color: ${isActive ? '#fff' : '#e0e0e0'};
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    font-weight: ${isActive ? 'bold' : 'normal'};
                ">${i}</button>`);
            }
            
            // 最后一页
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    pages.push(`<span style="color: #666; padding: 0 4px;">...</span>`);
                }
                pages.push(`<button class="pagination-page" data-page="${totalPages}" data-pagination-type="${type}" style="
                    padding: 8px 12px;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    color: #e0e0e0;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                ">${totalPages}</button>`);
            }
            
            return pages.join('');
        },
        
        /**
         * 绑定分页事件
         */
        _bindPaginationEvents: function(type) {
            const container = type === 'search' ? this._searchResults : this._defaultContent;
            if (!container) return;
            
            const paginationContainer = container.querySelector('.pagination-container');
            if (!paginationContainer) return;
            
            // 上一页/下一页按钮
            paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (btn.disabled) return;
                    
                    const action = btn.dataset.action;
                    const currentPage = this._pagination.currentPage;
                    
                    if (action === 'prev' && currentPage > 1) {
                        this._loadPage(type, currentPage - 1);
                    } else if (action === 'next' && currentPage < this._pagination.totalPages) {
                        this._loadPage(type, currentPage + 1);
                    }
                });
                
                // 悬停效果
                if (!btn.disabled) {
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = '#3a3a3a';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = '#2a2a2a';
                    });
                }
            });
            
            // 页码按钮
            paginationContainer.querySelectorAll('.pagination-page').forEach(btn => {
                btn.addEventListener('click', () => {
                    const page = parseInt(btn.dataset.page);
                    if (page !== this._pagination.currentPage) {
                        this._loadPage(type, page);
                    }
                });
                
                // 悬停效果
                if (!btn.style.background.includes('#ec4141')) {
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = '#3a3a3a';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = '#2a2a2a';
                    });
                }
            });
        },
        
        /**
         * 加载指定页面
         */
        _loadPage: function(type, page) {
            switch (type) {
                case 'search':
                    this._performSearch(page);
                    break;
                case 'rank':
                    this._loadRankList(page);
                    break;
                case 'daily':
                    this._loadDailyRecommend(page);
                    break;
                case 'artistSongs':
                    this._loadArtistSongs(this._pagination.currentArtistId, page);
                    break;
                case 'playlist':
                    this._loadPlaylistSongs(this._pagination.currentPlaylistId, page);
                    break;
                case 'artist':
                    this._loadArtists(page);
                    break;
                default:
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', `未知的分页类型: ${type}`);
                    }
            }
        },
        
        
        async _loadArtistSongs(artistId, page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'artistSongs';
                this._pagination.currentArtistId = artistId;
                
                const response = await this._fetch(`${this.API_BASE}?id=${artistId}&page=${page}&limit=${this._pagination.pageSize}&type=artistMusic`);
                const data = await response.json();
                
                if (data.code === 200 && data.data) {
                    const songs = Array.isArray(data.data) ? data.data : [];
                    
                    // 更新分页信息
                    if (data.total !== undefined) {
                        this._pagination.total = data.total;
                        this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                    } else {
                        this._pagination.totalPages = songs.length === this._pagination.pageSize ? page + 1 : page;
                    }
                    
                    const paginationHtml = this._createPaginationHTML('artistSongs', page);
                    const startIndex = (page - 1) * this._pagination.pageSize;
                    
                    this._defaultContent.innerHTML = `
                        <div style="margin-bottom: 20px;">
                            <button class="back-button" style="
                                padding: 8px 16px;
                                background: #2a2a2a;
                                border: none;
                                border-radius: 4px;
                                color: #e0e0e0;
                                cursor: pointer;
                                margin-bottom: 20px;
                            ">← 返回</button>
                            <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #e0e0e0;">歌手歌曲</h2>
                            <div style="font-size: 12px; color: #999;">${this._pagination.total || songs.length} 首歌曲</div>
                        </div>
                        <div class="artist-songs-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                            ${songs.length > 0 ? songs.map((song, index) => `
                                <div class="artist-song-item" data-rid="${song.rid}" style="
                                    display: flex;
                                    align-items: center;
                                    padding: 12px 20px;
                                    border-bottom: 1px solid #333;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">
                                    <div style="width: 30px; text-align: center; font-size: 14px; color: #999;">${startIndex + index + 1}</div>
                                    <img src="${song.pic || song.albumpic}" style="
                                        width: 50px;
                                        height: 50px;
                                        border-radius: 4px;
                                        object-fit: cover;
                                        margin: 0 15px;
                                    " onerror="this.style.display='none';">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                        <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.album}</div>
                                    </div>
                                </div>
                            `).join('') : '<div style="padding: 40px; text-align: center; color: #999;">暂无歌曲</div>'}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 返回按钮
                    this._defaultContent.querySelector('.back-button').addEventListener('click', () => {
                        this._loadArtists();
                    });
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('artistSongs');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.artist-song-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                            const rid = item.dataset.rid;
                            // 从原始数据中获取歌曲信息（更可靠）
                            const songData = songs[index];
                            if (songData) {
                                const song = {
                                    rid: songData.rid || rid,
                                    name: songData.name || '未知歌曲',
                                    artist: songData.artist || '未知艺术家',
                                    pic: songData.pic || songData.albumpic || '',
                                    url: `${this.API_BASE}?id=${songData.rid || rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${songData.rid || rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            } else {
                                // 如果原始数据不可用，从DOM提取（备用方案）
                                const nameEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 14px"]');
                                const artistEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 12px"]');
                                const imgEl = item.querySelector('img');
                                
                                const song = {
                                    rid: rid,
                                    name: nameEl ? nameEl.textContent.trim() : '未知歌曲',
                                    artist: artistEl ? artistEl.textContent.trim() : '未知艺术家',
                                    pic: imgEl && imgEl.src ? imgEl.src : '',
                                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            }
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#2a2a2a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = 'transparent';
                        });
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌手歌曲失败', e);
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        async _playSongById(rid) {
            try {
                // 先尝试从当前显示的内容中获取歌曲信息（如果可用）
                let song = {
                    rid: rid,
                    name: '加载中...',
                    artist: '未知艺术家',
                    pic: '',
                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                };
                
                // 尝试从搜索结果或当前内容中获取歌曲信息
                const searchItems = this._searchResults ? this._searchResults.querySelectorAll('[data-rid="' + rid + '"]') : [];
                const defaultItems = this._defaultContent ? this._defaultContent.querySelectorAll('[data-rid="' + rid + '"]') : [];
                const allItems = [...searchItems, ...defaultItems];
                
                if (allItems.length > 0) {
                    const item = allItems[0];
                    const nameEl = item.querySelector('div[style*="font-size: 14px"]');
                    const artistEl = item.querySelector('div[style*="font-size: 12px"]');
                    const imgEl = item.querySelector('img');
                    
                    if (nameEl) {
                        song.name = nameEl.textContent.trim();
                    }
                    if (artistEl) {
                        const artistText = artistEl.textContent.trim();
                        const parts = artistText.split(' - ');
                        if (parts.length > 0) {
                            song.artist = parts[0];
                        }
                    }
                    if (imgEl && imgEl.src) {
                        song.pic = imgEl.src;
                    }
                }
                
                // 播放歌曲
                await this._playSong(song);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '播放歌曲失败', e);
                }
                this._showMessage('播放失败，请稍后重试');
            }
        },
        
        // 根据歌曲ID获取完整歌曲信息
        async _fetchSongInfo(rid) {
            try {
                const ridStr = String(rid);
                let songData = null;
                
                // 首先检查缓存（只包含歌名、艺术家、专辑、歌词）
                const cached = this._songInfoCache[ridStr];
                
                // 方法1: 如果缓存中有歌名，使用搜索API获取最新的URL和封面
                if (cached && cached.name && cached.name !== '未知歌曲') {
                    try {
                        // 使用歌名搜索，优先匹配rid
                        const searchResponse = await this._fetch(`${this.API_BASE}?name=${encodeURIComponent(cached.name)}&page=1&limit=20`);
                        const searchData = await searchResponse.json();
                        
                        if (searchData.code === 200 && Array.isArray(searchData.data)) {
                            // 优先查找完全匹配rid的歌曲
                            songData = searchData.data.find(s => String(s.rid) === ridStr);
                            
                            // 如果找不到完全匹配的，使用第一个结果（可能是同名歌曲）
                            if (!songData && searchData.data.length > 0) {
                                // 尝试匹配艺术家
                                const matchedByArtist = searchData.data.find(s => 
                                    s.artist && cached.artist && 
                                    (s.artist.includes(cached.artist) || cached.artist.includes(s.artist))
                                );
                                songData = matchedByArtist || searchData.data[0];
                            }
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `通过搜索API查找歌曲 ${rid} 失败: ${e.message}`);
                        }
                    }
                }
                
                // 方法2: 如果搜索API失败或缓存中没有歌名，尝试从热歌榜中查找
                if (!songData) {
                    try {
                        const rankResponse = await this._fetch(`${this.API_BASE}?name=热歌榜&type=rank&limit=200`);
                        const rankData = await rankResponse.json();
                        if (rankData.code === 200 && rankData.data && rankData.data.musicList) {
                            songData = rankData.data.musicList.find(s => String(s.rid) === ridStr);
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `从热歌榜查找歌曲 ${rid} 失败: ${e.message}`);
                        }
                    }
                }
                
                // 方法3: 如果还是找不到，尝试从推荐歌单中查找
                if (!songData) {
                    try {
                        for (let page = 1; page <= 3 && !songData; page++) {
                            const playlistResponse = await this._fetch(`${this.API_BASE}?type=new&page=${page}&limit=20`);
                            const playlistData = await playlistResponse.json();
                            if (playlistData.code === 200 && Array.isArray(playlistData.data)) {
                                for (const playlist of playlistData.data) {
                                    if (playlist.rid && String(playlist.rid) === ridStr) {
                                        songData = playlist;
                                        break;
                                    }
                                }
                                if (songData) break;
                            }
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `从推荐歌单查找歌曲 ${rid} 失败: ${e.message}`);
                        }
                    }
                }
                
                // 如果找到了歌曲数据，返回完整信息并更新缓存
                if (songData) {
                    const songInfo = {
                        rid: songData.rid || ridStr,
                        name: songData.name || (cached?.name) || '未知歌曲',
                        artist: songData.artist || (cached?.artist) || '未知艺术家',
                        album: songData.album || (cached?.album) || '',
                        pic: songData.pic || '',
                        url: songData.url || `${this.API_BASE}?id=${songData.rid || ridStr}&type=song&level=exhigh&format=mp3`,
                        lrc: songData.lrc || `${this.API_BASE}?id=${songData.rid || ridStr}&type=lyr&format=all`
                    };
                    
                    // 更新缓存（不保存URL和封面）
                    this._songInfoCache[ridStr] = {
                        name: songInfo.name,
                        artist: songInfo.artist,
                        album: songInfo.album,
                        lyrics: cached?.lyrics || null // 保留已有的歌词
                    };
                    
                    // 异步保存缓存（不阻塞返回）
                    this._saveSettings().catch(e => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '保存歌曲缓存失败', e);
                        }
                    });
                    
                    return songInfo;
                }
                
                // 如果缓存中有基本信息，返回缓存信息（URL和封面使用默认生成方式）
                // 注意：如果缓存中只有歌词但没有基本信息，继续尝试其他方法获取
                if (cached && cached.name && cached.name !== '未知歌曲' && 
                    cached.artist && cached.artist !== '未知艺术家') {
                    return {
                        rid: ridStr,
                        name: cached.name,
                        artist: cached.artist,
                        album: cached.album || '',
                        pic: '', // 封面需要实时获取
                        url: `${this.API_BASE}?id=${ridStr}&type=song&level=exhigh&format=mp3`,
                        lrc: `${this.API_BASE}?id=${ridStr}&type=lyr&format=all`,
                        lyrics: cached.lyrics || null
                    };
                }
                
                // 如果缓存中只有歌词但没有基本信息，保留歌词但继续尝试获取基本信息
                if (cached && cached.lyrics && (!cached.name || cached.name === '未知歌曲')) {
                    // 继续执行下面的逻辑，尝试获取基本信息
                }
                
                // 如果所有方法都失败，返回基本结构（至少可以播放）
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('MusicPlayer', `无法获取歌曲 ${rid} 的详细信息，使用基本结构。建议：收藏时确保歌曲信息完整。`);
                }
                return {
                    rid: ridStr,
                    name: '未知歌曲',
                    artist: '未知艺术家',
                    album: '',
                    pic: '',
                    url: `${this.API_BASE}?id=${ridStr}&type=song&level=exhigh&format=mp3`,
                    lrc: `${this.API_BASE}?id=${ridStr}&type=lyr&format=all`
                };
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '获取歌曲信息失败', e);
                }
                // 返回基本结构
                return {
                    rid: String(rid),
                    name: '未知歌曲',
                    artist: '未知艺术家',
                    album: '',
                    pic: '',
                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                };
            }
        },
        
        // 实时获取歌曲封面URL
        async _fetchSongCover(rid) {
            try {
                const ridStr = String(rid);
                const cached = this._songInfoCache[ridStr];
                
                // 如果缓存中有歌名，使用搜索API获取封面
                if (cached && cached.name && cached.name !== '未知歌曲') {
                    try {
                        const searchResponse = await this._fetch(`${this.API_BASE}?name=${encodeURIComponent(cached.name)}&page=1&limit=20`);
                        const searchData = await searchResponse.json();
                        
                        if (searchData.code === 200 && Array.isArray(searchData.data)) {
                            // 优先查找完全匹配rid的歌曲
                            let songData = searchData.data.find(s => String(s.rid) === ridStr);
                            
                            // 如果找不到完全匹配的，使用第一个结果
                            if (!songData && searchData.data.length > 0) {
                                // 尝试匹配艺术家
                                const matchedByArtist = searchData.data.find(s => 
                                    s.artist && cached.artist && 
                                    (s.artist.includes(cached.artist) || cached.artist.includes(s.artist))
                                );
                                songData = matchedByArtist || searchData.data[0];
                            }
                            
                            if (songData && songData.pic) {
                                return songData.pic;
                            }
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `通过搜索API获取封面失败: ${e.message}`);
                        }
                    }
                }
                
                // 如果搜索API失败，尝试调用_fetchSongInfo获取完整信息
                const songInfo = await this._fetchSongInfo(rid);
                return songInfo.pic || '';
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '获取歌曲封面失败', e);
                }
                return '';
            }
        },
        
        async _playSong(song) {
            // 如果程序正在退出，不执行播放操作
            if (this._isExiting) {
                return;
            }
            
            try {
                // 如果song只有rid（字符串或数字），需要先获取完整信息
                let fullSong = song;
                if (typeof song === 'string' || typeof song === 'number') {
                    fullSong = await this._fetchSongInfo(song);
                } else if (song.rid) {
                    // 如果歌曲信息不完整（缺少名称、艺术家或封面），强制重新获取
                    const needsRefresh = !song.name || song.name === '未知歌曲' || 
                                       !song.artist || song.artist === '未知艺术家' || 
                                       !song.pic || song.pic === '';
                    
                    if (needsRefresh) {
                        // 强制重新获取完整信息
                        fullSong = await this._fetchSongInfo(song.rid);
                    } else {
                        fullSong = song;
                    }
                }
                
                // 确保URL存在（如果从搜索API获取的数据中没有URL，则使用默认生成方式）
                if (!fullSong.url || fullSong.url === '') {
                    fullSong.url = `${this.API_BASE}?id=${fullSong.rid}&type=song&level=exhigh&format=mp3`;
                }
                
                // 确保歌词URL存在
                if (!fullSong.lrc || fullSong.lrc === '') {
                    fullSong.lrc = `${this.API_BASE}?id=${fullSong.rid}&type=lyr&format=all`;
                }
                
                // 实时获取封面（如果不存在或需要更新）
                // 优先使用搜索API获取，如果失败则使用默认方式
                if (!fullSong.pic || fullSong.pic === '') {
                    fullSong.pic = await this._fetchSongCover(fullSong.rid);
                }
                
                // 确保歌曲信息保存到缓存（不保存URL和封面）
                const ridStr = String(fullSong.rid);
                if (fullSong.name && fullSong.name !== '未知歌曲' && 
                    fullSong.artist && fullSong.artist !== '未知艺术家') {
                    if (!this._songInfoCache[ridStr]) {
                        this._songInfoCache[ridStr] = {};
                    }
                    // 更新基本信息（保留已有的歌词）
                    this._songInfoCache[ridStr].name = fullSong.name;
                    this._songInfoCache[ridStr].artist = fullSong.artist;
                    this._songInfoCache[ridStr].album = fullSong.album || '';
                    // 保留已有的歌词，不覆盖
                    if (!this._songInfoCache[ridStr].lyrics) {
                        this._songInfoCache[ridStr].lyrics = null;
                    }
                    
                    // 异步保存缓存（不阻塞播放）
                    this._saveSettings().catch(e => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '保存歌曲信息到缓存失败', e);
                        }
                    });
                }
                
                this._currentSong = fullSong;
                
                // 先更新UI（在加载音频之前）
                if (this._playerSongName) {
                    this._playerSongName.textContent = fullSong.name || '未知歌曲';
                }
                if (this._playerArtistName) {
                    this._playerArtistName.textContent = fullSong.artist || '未知艺术家';
                }
                
                // 更新封面（添加淡入淡出动画）
                if (this._playerCover) {
                    this._playerCover.style.opacity = '0.5';
                    this._playerCover.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    
                    // 使用 requestAnimationFrame 确保DOM更新
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            if (fullSong.pic && fullSong.pic !== '') {
                                const img = document.createElement('img');
                                // 添加时间戳防止缓存
                                const picUrl = fullSong.pic + (fullSong.pic.includes('?') ? '&' : '?') + '_t=' + Date.now();
                                img.src = picUrl;
                                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                                img.onload = () => {
                                    if (this._playerCover) {
                                        this._playerCover.innerHTML = '';
                                        this._playerCover.appendChild(img);
                                        this._playerCover.style.opacity = '1';
                                        this._playerCover.style.transform = 'scale(1)';
                                    }
                                };
                                img.onerror = () => {
                                    // 如果图片加载失败，尝试重新获取封面
                                    this._fetchSongCover(fullSong.rid).then(newPic => {
                                        if (newPic && newPic !== '' && this._playerCover) {
                                            const retryImg = document.createElement('img');
                                            retryImg.src = newPic + (newPic.includes('?') ? '&' : '?') + '_t=' + Date.now();
                                            retryImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                                            retryImg.onload = () => {
                                                if (this._playerCover) {
                                                    this._playerCover.innerHTML = '';
                                                    this._playerCover.appendChild(retryImg);
                                                    this._playerCover.style.opacity = '1';
                                                    this._playerCover.style.transform = 'scale(1)';
                                                }
                                            };
                                            retryImg.onerror = () => {
                                                if (this._playerCover) {
                                                    this._playerCover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎵</div>';
                                                    this._playerCover.style.opacity = '1';
                                                    this._playerCover.style.transform = 'scale(1)';
                                                }
                                            };
                                        } else if (this._playerCover) {
                                            this._playerCover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎵</div>';
                                            this._playerCover.style.opacity = '1';
                                            this._playerCover.style.transform = 'scale(1)';
                                        }
                                    });
                                };
                            } else {
                                // 如果没有封面URL，尝试获取
                                this._fetchSongCover(fullSong.rid).then(pic => {
                                    if (pic && pic !== '' && this._playerCover) {
                                        const img = document.createElement('img');
                                        img.src = pic + (pic.includes('?') ? '&' : '?') + '_t=' + Date.now();
                                        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                                        img.onload = () => {
                                            if (this._playerCover) {
                                                this._playerCover.innerHTML = '';
                                                this._playerCover.appendChild(img);
                                                this._playerCover.style.opacity = '1';
                                                this._playerCover.style.transform = 'scale(1)';
                                            }
                                        };
                                        img.onerror = () => {
                                            if (this._playerCover) {
                                                this._playerCover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎵</div>';
                                                this._playerCover.style.opacity = '1';
                                                this._playerCover.style.transform = 'scale(1)';
                                            }
                                        };
                                    } else if (this._playerCover) {
                                        this._playerCover.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎵</div>';
                                        this._playerCover.style.opacity = '1';
                                        this._playerCover.style.transform = 'scale(1)';
                                    }
                                });
                            }
                        }, 150);
                    });
                }
                
                // 重置进度
                if (this._progressFill) {
                    this._progressFill.style.width = '0%';
                }
                if (this._timeCurrent) {
                    this._timeCurrent.textContent = '00:00';
                }
                if (this._timeTotal) {
                    this._timeTotal.textContent = '00:00';
                }
                
                // 添加到播放列表
                const existingIndex = this._playlist.findIndex(s => String(s.rid) === String(fullSong.rid));
                if (existingIndex === -1) {
                    this._playlist.push(fullSong);
                    this._currentIndex = this._playlist.length - 1;
                } else {
                    this._currentIndex = existingIndex;
                    // 更新播放列表中的歌曲信息（确保信息是最新的）
                    this._playlist[existingIndex] = fullSong;
                }
                
                // 更新收藏按钮状态
                this._updateFavoriteButton();
                
                // 先暂停并清空当前播放，避免 AbortError
                if (this._isLoading) {
                    // 如果正在加载，先等待完成或取消
                    this._audio.pause();
                    this._audio.src = '';
                    this._audio.load();
                } else {
                    this._audio.pause();
                }
                
                // 设置加载标志
                this._isLoading = true;
                
                // 等待一小段时间，确保前一个操作完成
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // 检查音频对象是否存在
                if (!this._audio) {
                    this._isLoading = false;
                    throw new Error('音频对象未初始化');
                }
                
                // 设置音频源
                this._audio.src = fullSong.url;
                
                // 等待音频加载完成
                await new Promise((resolve, reject) => {
                    const onCanPlay = () => {
                        // 如果程序正在退出，不处理
                        if (this._isExiting) {
                            if (this._audio) {
                                this._audio.removeEventListener('canplaythrough', onCanPlay);
                                this._audio.removeEventListener('error', onError);
                            }
                            this._isLoading = false;
                            reject(new Error('程序已退出'));
                            return;
                        }
                        if (this._audio) {
                            this._audio.removeEventListener('canplaythrough', onCanPlay);
                            this._audio.removeEventListener('error', onError);
                        }
                        this._isLoading = false;
                        resolve();
                    };
                    
                    const onError = (e) => {
                        // 如果程序正在退出，不处理错误
                        if (this._isExiting) {
                            if (this._audio) {
                                this._audio.removeEventListener('canplaythrough', onCanPlay);
                                this._audio.removeEventListener('error', onError);
                            }
                            this._isLoading = false;
                            reject(new Error('程序已退出'));
                            return;
                        }
                        if (this._audio) {
                            this._audio.removeEventListener('canplaythrough', onCanPlay);
                            this._audio.removeEventListener('error', onError);
                        }
                        this._isLoading = false;
                        reject(e);
                    };
                    
                    // 如果已经可以播放，直接resolve
                    if (this._audio.readyState >= 3) { // HAVE_FUTURE_DATA
                        this._isLoading = false;
                        resolve();
                    } else {
                        this._audio.addEventListener('canplaythrough', onCanPlay, { once: true });
                        this._audio.addEventListener('error', onError, { once: true });
                        this._audio.load();
                        
                        // 设置超时（10秒）
                        const timeoutId = setTimeout(() => {
                            // 如果程序正在退出，不处理超时
                            if (this._isExiting) {
                                if (this._audio) {
                                    this._audio.removeEventListener('canplaythrough', onCanPlay);
                                    this._audio.removeEventListener('error', onError);
                                }
                                this._isLoading = false;
                                reject(new Error('程序已退出'));
                                return;
                            }
                            if (this._isLoading) {
                                if (this._audio) {
                                    this._audio.removeEventListener('canplaythrough', onCanPlay);
                                    this._audio.removeEventListener('error', onError);
                                }
                                this._isLoading = false;
                                reject(new Error('音频加载超时'));
                            }
                        }, 10000);
                        
                        // 如果程序退出，清理超时定时器
                        if (this._isExiting) {
                            clearTimeout(timeoutId);
                        }
                    }
                });
                
                // 播放
                try {
                    await this._audio.play();
                    this._isPlaying = true;
                    this._updatePlayButton();
                    
                    // 更新收藏按钮状态
                    this._updateFavoriteButton();
                    
                    // 添加播放动画类
                    if (this._playerCover) {
                        this._playerCover.classList.add('playing');
                    }
                    
                    // 更新通知中的播放状态
                    if (this._useNotification) {
                        this._updateNotificationDependent();
                    }
                } catch (playError) {
                    // 如果程序正在退出，不处理错误
                    if (this._isExiting) {
                        return;
                    }
                    
                    // 忽略 AbortError（通常是因为快速切换歌曲导致的）
                    if (playError.name !== 'AbortError') {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', '播放失败', playError);
                        }
                        this._showMessage('播放失败，请检查音频源');
                    }
                    this._isPlaying = false;
                    this._updatePlayButton();
                    
                    // 移除播放动画类
                    if (this._playerCover) {
                        this._playerCover.classList.remove('playing');
                    }
                    
                    // 更新通知中的播放状态
                    if (this._useNotification) {
                        this._updateNotificationDependent();
                    }
                }
                
                // 加载歌词
                if (fullSong.lrc) {
                    this._loadLyrics(fullSong.lrc);
                }
                
                // 如果处于沉浸式模式，更新沉浸式页面
                if (this._isImmersiveMode) {
                    this._updateImmersiveView();
                }
                
                // 更新桌面组件
                this._updateDesktopWidget();
            } catch (e) {
                // 如果程序正在退出，不处理错误
                if (this._isExiting) {
                    return;
                }
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '播放失败', e);
                }
                this._showMessage('播放失败，请稍后重试');
                this._isPlaying = false;
                this._updatePlayButton();
            }
        },
        
        async _loadLyrics(lrcUrl) {
            // 如果程序正在退出，不加载歌词
            if (this._isExiting) {
                return;
            }
            
            try {
                // 如果当前歌曲有缓存的歌词，直接使用
                if (this._currentSong && this._currentSong.rid && this._songInfoCache[String(this._currentSong.rid)]?.lyrics) {
                    const cachedLyrics = this._songInfoCache[String(this._currentSong.rid)].lyrics;
                    this._parseLyrics(cachedLyrics);
                    return;
                }
                
                // 否则从API加载
                const response = await this._fetch(lrcUrl);
                
                // 再次检查退出状态（可能在fetch期间退出）
                if (this._isExiting) {
                    return;
                }
                
                const data = await response.json();
                
                if (data.code === 200 && data.data && data.data.lrclist) {
                    const lyricsText = data.data.lrclist;
                    this._parseLyrics(lyricsText);
                    
                    // 保存歌词到缓存
                    if (this._currentSong && this._currentSong.rid) {
                        const ridStr = String(this._currentSong.rid);
                        if (!this._songInfoCache[ridStr]) {
                            this._songInfoCache[ridStr] = {};
                        }
                        this._songInfoCache[ridStr].lyrics = lyricsText;
                        
                        // 异步保存缓存
                        this._saveSettings().catch(e => {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('MusicPlayer', '保存歌词缓存失败', e);
                            }
                        });
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌词失败', e);
                }
            }
        },
        
        _parseLyrics(lrcText) {
            const lines = lrcText.split('\n');
            this._lyrics = [];
            
            lines.forEach(line => {
                const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                if (match) {
                    const minutes = parseInt(match[1]);
                    const seconds = parseInt(match[2]);
                    const milliseconds = parseInt(match[3].padEnd(3, '0'));
                    const time = minutes * 60 + seconds + milliseconds / 1000;
                    const text = match[4].trim();
                    if (text) {
                        this._lyrics.push({ time, text });
                    }
                }
            });
            
            this._lyrics.sort((a, b) => a.time - b.time);
        },
        
        _togglePlay() {
            // 如果程序正在退出，不执行操作
            if (this._isExiting) {
                return;
            }
            
            if (this._isPlaying) {
                this._audio.pause();
                this._isPlaying = false;
                // 移除播放动画类
                if (this._playerCover) {
                    this._playerCover.classList.remove('playing');
                }
                // 更新通知中的播放状态
                if (this._useNotification) {
                    this._updateNotificationDependent();
                }
            } else {
                if (this._currentSong && this._audio.src) {
                    this._audio.play().then(() => {
                        // 如果程序正在退出，不处理播放成功
                        if (this._isExiting) {
                            return;
                        }
                        this._isPlaying = true;
                        this._updatePlayButton();
                        // 添加播放动画类
                        if (this._playerCover) {
                            this._playerCover.classList.add('playing');
                        }
                        // 更新通知中的播放状态
                        if (this._useNotification) {
                            this._updateNotificationDependent();
                        }
                    }).catch(e => {
                        // 如果程序正在退出，不处理错误
                        if (this._isExiting) {
                            return;
                        }
                        // 忽略 AbortError
                        if (e.name !== 'AbortError') {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('MusicPlayer', '播放失败', e);
                            }
                            this._showMessage('播放失败，请稍后重试');
                        }
                    });
                } else if (this._playlist.length > 0) {
                    this._playSong(this._playlist[0]);
                } else {
                    this._showMessage('没有可播放的歌曲');
                }
            }
            this._updatePlayButton();
        },
        
        // 显示消息提示
        _showMessage: function(message) {
            // 如果程序正在退出，不显示消息
            if (this._isExiting) {
                return;
            }
            
            try {
                // 使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: '音乐播放器',
                        content: message,
                        duration: 3000
                    }).catch(e => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `创建通知失败: ${e.message}`);
                        }
                    });
                } else {
                    // 降级方案：使用 console
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('MusicPlayer', message);
                    }
                }
            } catch (e) {
                // 如果显示消息失败，只记录日志
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('MusicPlayer', message);
                }
            }
        },
        
        _playPrev() {
            // 如果程序正在退出，不执行播放操作
            if (this._isExiting) {
                return;
            }
            if (this._playlist.length === 0) return;
            this._currentIndex = (this._currentIndex - 1 + this._playlist.length) % this._playlist.length;
            this._playSong(this._playlist[this._currentIndex]);
        },
        
        _playNext() {
            // 如果程序正在退出，不执行播放操作
            if (this._isExiting) {
                return;
            }
            if (this._playlist.length === 0) return;
            
            switch (this._playMode) {
                case 'single':
                    // 单曲循环：重新播放当前歌曲
                    this._playSong(this._playlist[this._currentIndex]);
                    break;
                case 'random':
                    // 随机播放
                    let randomIndex;
                    do {
                        randomIndex = Math.floor(Math.random() * this._playlist.length);
                    } while (randomIndex === this._currentIndex && this._playlist.length > 1);
                    this._currentIndex = randomIndex;
                    this._playSong(this._playlist[this._currentIndex]);
                    break;
                case 'list':
                default:
                    // 列表循环：播放下一首
                    this._currentIndex = (this._currentIndex + 1) % this._playlist.length;
                    this._playSong(this._playlist[this._currentIndex]);
                    break;
            }
        },
        
        _togglePlayMode() {
            const modes = ['list', 'single', 'random'];
            const modeNames = {
                'list': '列表循环',
                'single': '单曲循环',
                'random': '随机播放'
            };
            const modeIcons = {
                'list': '🔁',
                'single': '🔂',
                'random': '🔀'
            };
            
            const currentIndex = modes.indexOf(this._playMode);
            this._playMode = modes[(currentIndex + 1) % modes.length];
            
            if (this._playModeButton) {
                this._playModeButton.textContent = modeIcons[this._playMode];
                this._playModeButton.title = modeNames[this._playMode];
            }
            
            this._showMessage(modeNames[this._playMode]);
        },
        
        _updatePlayButton() {
            if (this._playButton) {
                this._playButton.textContent = this._isPlaying ? '⏸' : '▶';
            }
            // 更新沉浸式播放按钮
            if (this._immersivePlayButton) {
                this._immersivePlayButton.textContent = this._isPlaying ? '⏸' : '▶';
            }
            // 更新沉浸式封面旋转动画（只旋转顶层）
            if (this._immersiveCover) {
                if (this._isPlaying) {
                    this._immersiveCover.classList.add('playing');
                } else {
                    this._immersiveCover.classList.remove('playing');
                }
            }
            // 更新桌面组件
            this._updateDesktopWidget();
        },
        
        _updateProgress() {
            if (!this._audio) return;
            
            const current = this._audio.currentTime;
            const duration = this._audio.duration || 0;
            
            // 更新底部播放栏
            if (this._timeCurrent) {
                this._timeCurrent.textContent = this._formatTime(current);
            }
            if (this._timeTotal) {
                this._timeTotal.textContent = this._formatTime(duration);
            }
            if (this._progressFill) {
                const percent = duration > 0 ? (current / duration) * 100 : 0;
                this._progressFill.style.width = `${percent}%`;
            }
            
            // 更新沉浸式播放页面
            if (this._isImmersiveMode) {
                if (this._immersiveTimeCurrent) {
                    this._immersiveTimeCurrent.textContent = this._formatTime(current);
                }
                if (this._immersiveTimeTotal) {
                    this._immersiveTimeTotal.textContent = this._formatTime(duration);
                }
                if (this._immersiveProgressFill) {
                    const percent = duration > 0 ? (current / duration) * 100 : 0;
                    this._immersiveProgressFill.style.width = `${percent}%`;
                }
            }
            
            // 更新通知进度条
            if (this._notificationId && typeof NotificationManager !== 'undefined') {
                try {
                    const container = NotificationManager.getNotificationContentContainer(this._notificationId);
                    if (container) {
                        const progressBar = container.querySelector('.music-notification-progress');
                        if (progressBar) {
                            const percent = duration > 0 ? (current / duration) * 100 : 0;
                            progressBar.style.width = `${percent}%`;
                        }
                    }
                } catch (e) {
                    // 忽略更新错误
                }
            }
        },
        
        _updateDuration() {
            if (this._timeTotal && this._audio) {
                this._timeTotal.textContent = this._formatTime(this._audio.duration || 0);
            }
        },
        
        _updateLyrics() {
            if (!this._lyrics || !this._audio) return;
            
            const currentTime = this._audio.currentTime;
            let newIndex = -1;
            
            for (let i = this._lyrics.length - 1; i >= 0; i--) {
                if (this._lyrics[i].time <= currentTime) {
                    newIndex = i;
                    break;
                }
            }
            
            if (newIndex !== this._currentLyricIndex) {
                this._currentLyricIndex = newIndex;
                // 更新沉浸式歌词显示
                if (this._isImmersiveMode) {
                    this._updateImmersiveLyrics();
                }
            }
        },
        
        _seekTo(percent) {
            if (!this._audio || !this._audio.duration) return;
            this._audio.currentTime = this._audio.duration * percent;
        },
        
        _setVolume(percent) {
            this._volume = Math.max(0, Math.min(1, percent));
            if (this._audio) {
                this._audio.volume = this._volume;
            }
            
            // 更新音量滑块
            if (this._volumeFill) {
                this._volumeFill.style.width = `${this._volume * 100}%`;
            }
            
            // 更新音量图标
            if (this._volumeIcon) {
                if (this._volume === 0) {
                    this._volumeIcon.textContent = '🔇';
                } else if (this._volume < 0.5) {
                    this._volumeIcon.textContent = '🔉';
                } else {
                    this._volumeIcon.textContent = '🔊';
                }
            }
        },
        
        _formatTime(seconds) {
            if (!isFinite(seconds)) return '00:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        },
        
        _showMessage(message) {
            // 简单的消息提示
            const msgEl = document.createElement('div');
            msgEl.textContent = message;
            msgEl.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: #e0e0e0;
                padding: 12px 24px;
                border-radius: 4px;
                z-index: 10000;
                font-size: 14px;
            `;
            document.body.appendChild(msgEl);
            setTimeout(() => {
                if (msgEl.parentElement) {
                    msgEl.parentElement.removeChild(msgEl);
                }
            }, 2000);
        },
        
        _cleanup() {
            if (this._audio) {
                this._audio.pause();
                this._audio.src = '';
                this._audio.load();
            }
            this._isLoading = false;
            this._isPlaying = false;
            
            // 根据设置清理桌面组件或通知依赖
            if (this._useNotification) {
                this._removeNotificationDependent();
            } else {
                this._removeDesktopComponent();
            }
        },
        
        _createDesktopComponent: function() {
            if (typeof DesktopManager === 'undefined') {
                return;
            }
            
            try {
                // 创建桌面组件（位置自动计算，避开图标）
                this._desktopComponentId = DesktopManager.createComponent(this.pid, {
                    type: 'music-widget',
                    // position 不指定，让系统自动计算避开图标的位置
                    size: { width: 320, height: 120 },
                    style: {
                        backgroundColor: 'rgba(30, 30, 30, 0.9)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                    },
                    persistent: false
                });
                
                // 获取内容容器
                const container = DesktopManager.getComponentContentContainer(this._desktopComponentId);
                if (!container) {
                    return;
                }
                
                this._desktopComponent = container;
                
                // 创建组件UI
                container.innerHTML = '';
                container.style.cssText = `
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    padding: 12px;
                    box-sizing: border-box;
                    color: #e0e0e0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `;
                
                // 顶部：歌曲信息
                const infoSection = document.createElement('div');
                infoSection.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-height: 0;
                `;
                
                // 封面（小）
                const cover = document.createElement('div');
                cover.className = 'desktop-widget-cover';
                cover.style.cssText = `
                    width: 60px;
                    height: 60px;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #2a2a2a;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                `;
                cover.innerHTML = '🎵';
                this._desktopWidgetCover = cover;
                
                // 歌曲信息
                const songInfo = document.createElement('div');
                songInfo.style.cssText = `
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 4px;
                `;
                
                const songName = document.createElement('div');
                songName.className = 'desktop-widget-song-name';
                songName.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #ffffff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
                songName.textContent = '未播放';
                this._desktopWidgetSongName = songName;
                
                const artistName = document.createElement('div');
                artistName.className = 'desktop-widget-artist-name';
                artistName.style.cssText = `
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.7);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
                artistName.textContent = '--';
                this._desktopWidgetArtistName = artistName;
                
                songInfo.appendChild(songName);
                songInfo.appendChild(artistName);
                
                infoSection.appendChild(cover);
                infoSection.appendChild(songInfo);
                
                // 底部：控制按钮
                const controlSection = document.createElement('div');
                controlSection.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-top: 8px;
                `;
                
                // 上一首
                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '⏮';
                prevBtn.style.cssText = `
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                `;
                prevBtn.onmouseenter = () => prevBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                prevBtn.onmouseleave = () => prevBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                prevBtn.onclick = () => this._playPrevious();
                
                // 播放/暂停
                const playBtn = document.createElement('button');
                playBtn.innerHTML = '▶';
                playBtn.style.cssText = `
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: linear-gradient(135deg, #ec4141 0%, #d63636 100%);
                    color: #ffffff;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    box-shadow: 0 2px 8px rgba(236, 65, 65, 0.4);
                `;
                playBtn.onmouseenter = () => {
                    playBtn.style.transform = 'scale(1.1)';
                    playBtn.style.boxShadow = '0 4px 12px rgba(236, 65, 65, 0.6)';
                };
                playBtn.onmouseleave = () => {
                    playBtn.style.transform = 'scale(1)';
                    playBtn.style.boxShadow = '0 2px 8px rgba(236, 65, 65, 0.4)';
                };
                playBtn.onclick = () => this._togglePlay();
                this._desktopWidgetPlayBtn = playBtn;
                
                // 下一首
                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '⏭';
                nextBtn.style.cssText = `
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                `;
                nextBtn.onmouseenter = () => nextBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                nextBtn.onmouseleave = () => nextBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                nextBtn.onclick = () => this._playNext();
                
                controlSection.appendChild(prevBtn);
                controlSection.appendChild(playBtn);
                controlSection.appendChild(nextBtn);
                
                container.appendChild(infoSection);
                container.appendChild(controlSection);
                
                // 双击打开主窗口
                container.ondblclick = () => {
                    if (typeof GUIManager !== 'undefined' && this.window) {
                        GUIManager.restoreWindow(this.pid);
                        GUIManager.focusWindow(this.pid);
                    }
                };
                
                // 更新初始状态
                this._updateDesktopWidget();
                
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '创建桌面组件失败', e);
                }
            }
        },
        
        _updateDesktopWidget: function() {
            // 根据设置更新桌面组件或通知依赖
            if (this._useNotification) {
                this._updateNotificationDependent();
            } else {
                this._updateDesktopWidgetContent();
            }
        },
        
        _updateDesktopWidgetContent: function() {
            if (!this._desktopComponent) return;
            
            // 更新歌曲信息
            if (this._desktopWidgetSongName && this._currentSong) {
                this._desktopWidgetSongName.textContent = this._currentSong.name || '未播放';
            }
            if (this._desktopWidgetArtistName && this._currentSong) {
                this._desktopWidgetArtistName.textContent = this._currentSong.artist || '--';
            }
            
            // 更新封面
            if (this._desktopWidgetCover && this._currentSong) {
                if (this._currentSong.pic) {
                    const img = document.createElement('img');
                    img.src = this._currentSong.pic;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    img.onerror = () => {
                        this._desktopWidgetCover.innerHTML = '🎵';
                    };
                    this._desktopWidgetCover.innerHTML = '';
                    this._desktopWidgetCover.appendChild(img);
                } else {
                    this._desktopWidgetCover.innerHTML = '🎵';
                }
            }
            
            // 更新播放按钮
            if (this._desktopWidgetPlayBtn) {
                this._desktopWidgetPlayBtn.innerHTML = this._isPlaying ? '⏸' : '▶';
            }
        },
        
        _removeDesktopComponent: function() {
            if (this._desktopComponentId && typeof DesktopManager !== 'undefined') {
                try {
                    DesktopManager.removeComponent(this._desktopComponentId);
                    this._desktopComponentId = null;
                    this._desktopComponent = null;
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('MusicPlayer', '删除桌面组件失败', e);
                    }
                }
            }
        },
        
        // 加载设置
        _loadSettings: async function() {
            try {
                if (typeof LStorage !== 'undefined') {
                    // 使用程序名称而不是pid，确保数据持久化
                    const settings = await LStorage.getSystemStorage('musicplayer.settings');
                    if (settings) {
                        if (typeof settings.useNotification === 'boolean') {
                            this._useNotification = settings.useNotification;
                        }
                        // 加载收藏列表
                        if (Array.isArray(settings.favorites)) {
                            this._favorites = settings.favorites;
                        }
                        // 加载歌单列表
                        if (Array.isArray(settings.playlists)) {
                            this._playlists = settings.playlists;
                        }
                    }
                    
                    // 加载歌曲信息缓存
                    const songCache = await LStorage.getSystemStorage('musicplayer.songCache');
                    if (songCache && typeof songCache === 'object') {
                        this._songInfoCache = songCache;
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载设置失败', e);
                }
            }
        },
        
        // 清理数据以确保JSON序列化安全
        _sanitizeDataForStorage: function(data) {
            if (data === null || data === undefined) {
                return data;
            }
            
            if (typeof data === 'string') {
                // 确保字符串是有效的UTF-8，移除控制字符（保留换行符和制表符）
                return data.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
            }
            
            if (Array.isArray(data)) {
                return data.map(item => this._sanitizeDataForStorage(item));
            }
            
            if (typeof data === 'object') {
                const sanitized = {};
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        sanitized[key] = this._sanitizeDataForStorage(data[key]);
                    }
                }
                return sanitized;
            }
            
            return data;
        },
        
        // 保存设置
        _saveSettings: async function() {
            try {
                if (typeof LStorage !== 'undefined') {
                    // 清理数据以确保JSON序列化安全
                    const sanitizedSettings = this._sanitizeDataForStorage({
                        useNotification: this._useNotification,
                        favorites: this._favorites,
                        playlists: this._playlists
                    });
                    
                    // 使用程序名称而不是pid，确保数据持久化
                    await LStorage.setSystemStorage('musicplayer.settings', sanitizedSettings);
                    
                    // 清理歌曲信息缓存数据
                    const sanitizedCache = this._sanitizeDataForStorage(this._songInfoCache);
                    
                    // 保存歌曲信息缓存（只保存歌名、艺术家、专辑、歌词，不保存URL和封面）
                    await LStorage.setSystemStorage('musicplayer.songCache', sanitizedCache);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '保存设置失败', e);
                }
                // 如果保存失败，尝试清理可能损坏的数据
                if (e.message && e.message.includes('JSON')) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', '检测到JSON序列化错误，尝试清理数据...');
                    }
                    // 清理歌词数据中的问题字符
                    if (this._songInfoCache) {
                        for (const key in this._songInfoCache) {
                            if (this._songInfoCache[key] && this._songInfoCache[key].lyrics) {
                                // 移除可能导致JSON错误的控制字符
                                this._songInfoCache[key].lyrics = this._songInfoCache[key].lyrics.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
                            }
                        }
                        // 重试保存
                        try {
                            const sanitizedCache = this._sanitizeDataForStorage(this._songInfoCache);
                            await LStorage.setSystemStorage('musicplayer.songCache', sanitizedCache);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('MusicPlayer', '清理后保存成功');
                            }
                        } catch (retryError) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('MusicPlayer', '重试保存仍然失败', retryError);
                            }
                        }
                    }
                }
                throw e;
            }
        },
        
        // 显示设置对话框
        _showSettings: function() {
            // 创建设置对话框
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            `;
            
            const content = document.createElement('div');
            content.style.cssText = `
                background: #1e1e1e;
                border-radius: 12px;
                padding: 24px;
                min-width: 400px;
                max-width: 500px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            `;
            
            content.innerHTML = `
                <div style="font-size: 18px; font-weight: 600; color: #e0e0e0; margin-bottom: 20px;">设置</div>
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; color: #b3b3b3; margin-bottom: 12px;">播放信息显示方式</div>
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; border-radius: 8px; transition: background 0.2s;" 
                           onmouseenter="this.style.background='#2a2a2a'" 
                           onmouseleave="this.style.background='transparent'">
                        <input type="radio" name="displayMode" value="desktop" ${!this._useNotification ? 'checked' : ''} 
                               style="cursor: pointer;">
                        <span style="color: #e0e0e0;">桌面组件</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; border-radius: 8px; transition: background 0.2s; margin-top: 8px;" 
                           onmouseenter="this.style.background='#2a2a2a'" 
                           onmouseleave="this.style.background='transparent'">
                        <input type="radio" name="displayMode" value="notification" ${this._useNotification ? 'checked' : ''} 
                               style="cursor: pointer;">
                        <span style="color: #e0e0e0;">通知依赖</span>
                    </label>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="settings-cancel" style="
                        padding: 8px 20px;
                        background: #2a2a2a;
                        color: #e0e0e0;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">取消</button>
                    <button id="settings-save" style="
                        padding: 8px 20px;
                        background: #ec4141;
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">保存</button>
                </div>
            `;
            
            dialog.appendChild(content);
            document.body.appendChild(dialog);
            
            // 安全移除对话框的辅助函数
            const safeRemoveDialog = () => {
                if (dialog && dialog.parentNode === document.body) {
                    try {
                        document.body.removeChild(dialog);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '移除对话框失败', e);
                        }
                        // 如果移除失败，尝试使用 remove 方法
                        if (dialog.remove) {
                            dialog.remove();
                        }
                    }
                }
            };
            
            // 取消按钮
            content.querySelector('#settings-cancel').addEventListener('click', () => {
                safeRemoveDialog();
            });
            
            // 保存按钮
            content.querySelector('#settings-save').addEventListener('click', async () => {
                try {
                    const selected = content.querySelector('input[name="displayMode"]:checked');
                    if (selected) {
                        const newUseNotification = selected.value === 'notification';
                        
                        // 如果设置改变，需要切换显示方式
                        if (newUseNotification !== this._useNotification) {
                            // 移除旧的
                            if (this._useNotification) {
                                this._removeNotificationDependent();
                            } else {
                                this._removeDesktopComponent();
                            }
                            
                            // 更新设置
                            this._useNotification = newUseNotification;
                            await this._saveSettings();
                            
                            // 创建新的
                            if (this._useNotification) {
                                this._createNotificationDependent();
                            } else {
                                this._createDesktopComponent();
                            }
                        } else {
                            // 只保存设置
                            this._useNotification = newUseNotification;
                            await this._saveSettings();
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('MusicPlayer', '保存设置时出错', e);
                    }
                    this._showMessage('保存设置失败: ' + e.message);
                } finally {
                    safeRemoveDialog();
                }
            });
        },
        
        // 创建通知依赖
        _createNotificationDependent: function() {
            if (typeof NotificationManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('MusicPlayer', 'NotificationManager 不可用');
                }
                return;
            }
            
            try {
                const currentSong = this._currentSong;
                const songName = currentSong ? (currentSong.name || '未知歌曲') : '未播放';
                const artistName = currentSong ? (currentSong.artist || '未知艺术家') : '';
                
                // 创建通知内容容器（简化布局）
                const content = document.createElement('div');
                content.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 0;
                    width: 100%;
                    box-sizing: border-box;
                    min-height: 100px;
                `;
                
                // 封面
                const cover = document.createElement('img');
                cover.src = currentSong && (currentSong.cover || currentSong.pic) ? (currentSong.cover || currentSong.pic) : '';
                cover.style.cssText = `
                    width: 80px;
                    height: 80px;
                    border-radius: 10px;
                    object-fit: cover;
                    background: rgba(42, 42, 42, 0.8);
                    flex-shrink: 0;
                `;
                cover.onerror = () => {
                    cover.style.display = 'none';
                };
                content.appendChild(cover);
                
                // 信息和控制区域
                const rightSection = document.createElement('div');
                rightSection.style.cssText = `
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    justify-content: center;
                `;
                
                // 信息区域
                const info = document.createElement('div');
                info.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                `;
                info.innerHTML = `
                    <div style="font-size: 15px; font-weight: 500; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${songName}
                    </div>
                    <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${artistName}
                    </div>
                `;
                rightSection.appendChild(info);
                
                // 控制按钮和进度条
                const controlsRow = document.createElement('div');
                controlsRow.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                // 控制按钮
                const controls = document.createElement('div');
                controls.style.cssText = `
                    display: flex;
                    gap: 6px;
                    align-items: center;
                    flex-shrink: 0;
                `;
                
                // 上一首按钮
                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '⏮';
                prevBtn.style.cssText = `
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #e0e0e0;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                `;
                prevBtn.onmouseenter = () => {
                    prevBtn.style.background = 'rgba(255, 255, 255, 0.15)';
                };
                prevBtn.onmouseleave = () => {
                    prevBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                };
                prevBtn.onclick = () => this._playPrevious();
                controls.appendChild(prevBtn);
                
                // 播放/暂停按钮
                const playBtn = document.createElement('button');
                playBtn.innerHTML = this._isPlaying ? '⏸' : '▶';
                playBtn.style.cssText = `
                    width: 48px;
                    height: 48px;
                    border: none;
                    background: #ec4141;
                    color: #ffffff;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                `;
                playBtn.onmouseenter = () => {
                    playBtn.style.background = '#d63031';
                };
                playBtn.onmouseleave = () => {
                    playBtn.style.background = '#ec4141';
                };
                playBtn.onclick = () => this._togglePlay();
                // 保存播放按钮引用以便更新
                playBtn.className = 'music-notification-play-btn';
                controls.appendChild(playBtn);
                
                // 下一首按钮
                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '⏭';
                nextBtn.style.cssText = `
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #e0e0e0;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                `;
                nextBtn.onmouseenter = () => {
                    nextBtn.style.background = 'rgba(255, 255, 255, 0.15)';
                };
                nextBtn.onmouseleave = () => {
                    nextBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                };
                nextBtn.onclick = () => this._playNext();
                controls.appendChild(nextBtn);
                
                controlsRow.appendChild(controls);
                
                // 进度条
                const progressContainer = document.createElement('div');
                progressContainer.style.cssText = `
                    flex: 1;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    overflow: hidden;
                    position: relative;
                    min-width: 80px;
                `;
                const progressBar = document.createElement('div');
                progressBar.className = 'music-notification-progress';
                progressBar.style.cssText = `
                    height: 100%;
                    width: ${this._audio && this._audio.duration ? (this._audio.currentTime / this._audio.duration * 100) : 0}%;
                    background: #ec4141;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                `;
                progressContainer.appendChild(progressBar);
                controlsRow.appendChild(progressContainer);
                
                rightSection.appendChild(controlsRow);
                content.appendChild(rightSection);
                
                // 保存进度条引用以便更新
                content._progressBar = progressBar;
                
                // 创建通知依赖（现在是异步方法，需要处理 Promise）
                // 如果程序正在退出，不创建通知
                if (this._isExiting) {
                    return;
                }
                
                NotificationManager.createNotification(this.pid, {
                    type: 'dependent',
                    title: '正在播放',
                    content: content,
                    onClose: (notificationId, pid) => {
                        // 通知被关闭时的回调
                        if (!this._isExiting) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('MusicPlayer', '通知被关闭');
                            }
                        }
                        this._notificationId = null;
                    }
                }).then(notificationId => {
                    // 如果程序正在退出，不保存通知ID
                    if (this._isExiting) {
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.removeNotification(notificationId, true).catch(() => {});
                        }
                        return;
                    }
                    this._notificationId = notificationId;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('MusicPlayer', `创建通知依赖: ${this._notificationId}`);
                    }
                }).catch(e => {
                    // 如果程序正在退出，忽略错误
                    if (!this._isExiting) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', '创建通知依赖失败', e);
                        }
                    }
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '创建通知依赖失败', e);
                }
            }
        },
        
        // 移除通知依赖
        _removeNotificationDependent: function() {
            // 如果程序正在退出，直接返回，不请求权限
            if (this._isExiting) {
                this._notificationId = null;
                return;
            }
            
            if (this._notificationId && typeof NotificationManager !== 'undefined') {
                try {
                    // removeNotification 现在是异步方法
                    NotificationManager.removeNotification(this._notificationId, true)
                        .then(() => {
                            this._notificationId = null;
                        })
                        .catch(e => {
                            // 如果程序正在退出，忽略错误
                            if (!this._isExiting) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('MusicPlayer', '删除通知依赖失败', e);
                                }
                            }
                        });
                } catch (e) {
                    // 如果程序正在退出，忽略错误
                    if (!this._isExiting) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', '删除通知依赖失败', e);
                        }
                    }
                }
            }
        },
        
        // 更新通知依赖
        _updateNotificationDependent: function() {
            // 如果程序正在退出，不更新通知
            if (this._isExiting) {
                return;
            }
            
            if (!this._notificationId || typeof NotificationManager === 'undefined') {
                return;
            }
            
            try {
                const container = NotificationManager.getNotificationContentContainer(this._notificationId);
                if (!container) {
                    return;
                }
                
                const currentSong = this._currentSong;
                const songName = currentSong ? (currentSong.name || '未知歌曲') : '未播放';
                const artistName = currentSong ? (currentSong.artist || '未知艺术家') : '';
                
                // 更新封面
                const cover = container.querySelector('img');
                if (cover) {
                    if (currentSong && (currentSong.cover || currentSong.pic)) {
                        cover.src = currentSong.cover || currentSong.pic;
                        cover.style.display = 'block';
                    } else {
                        cover.src = '';
                        cover.style.display = 'none';
                    }
                }
                
                // 更新歌曲信息（查找 rightSection 中的 info div）
                const rightSection = Array.from(container.children).find(child => 
                    child.tagName === 'DIV' && child.querySelector('div')
                );
                if (rightSection) {
                    const infoDiv = rightSection.querySelector('div:first-child');
                    if (infoDiv) {
                        const songNameDiv = infoDiv.querySelector('div:first-child');
                        const artistNameDiv = infoDiv.querySelector('div:last-child');
                        if (songNameDiv) {
                            songNameDiv.textContent = songName;
                        }
                        if (artistNameDiv) {
                            artistNameDiv.textContent = artistName;
                        }
                    }
                    
                    // 更新播放按钮（使用类名查找更可靠）
                    const playBtn = container.querySelector('.music-notification-play-btn');
                    if (playBtn) {
                        playBtn.innerHTML = this._isPlaying ? '⏸' : '▶';
                    } else {
                        // 降级方案：使用原来的选择器
                        const controlsRow = rightSection.querySelector('div:last-child');
                        if (controlsRow) {
                            const controlsDiv = controlsRow.querySelector('div:first-child');
                            if (controlsDiv) {
                                const buttons = controlsDiv.querySelectorAll('button');
                                if (buttons.length >= 2) {
                                    const playBtnFallback = buttons[1]; // 播放按钮是第二个
                                    playBtnFallback.innerHTML = this._isPlaying ? '⏸' : '▶';
                                }
                            }
                        }
                    }
                }
                
                // 更新进度条
                const progressBar = container.querySelector('.music-notification-progress');
                if (progressBar && this._audio) {
                    const progress = this._audio.duration ? (this._audio.currentTime / this._audio.duration * 100) : 0;
                    progressBar.style.width = `${progress}%`;
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '更新通知依赖失败', e);
                }
            }
        },
        
        _setupWindowSizeListener: function() {
            if (!this.window) return;
            
            // 初始大小
            this._updateWindowSize();
            
            // 监听窗口大小变化
            const resizeObserver = new ResizeObserver(() => {
                this._updateWindowSize();
            });
            
            resizeObserver.observe(this.window);
            
            // 也监听窗口的 resize 事件（作为备用）
            // 使用 EventManager 注册窗口 resize 事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._resizeHandlerId = EventManager.registerEventHandler(this.pid, 'resize', () => {
                    this._updateWindowSize();
                }, {
                    priority: 100,
                    selector: null  // 监听 window 的 resize 事件
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                window.addEventListener('resize', () => {
                    this._updateWindowSize();
                });
            }
        },
        
        _updateWindowSize: function() {
            if (!this.window) return;
            
            const rect = this.window.getBoundingClientRect();
            this._windowSize = {
                width: rect.width,
                height: rect.height
            };
            
            // 为主窗口添加响应式类
            const container = this.window.querySelector('.musicplayer-container');
            if (container) {
                // 移除所有响应式类
                container.classList.remove('musicplayer-small', 'musicplayer-medium', 'musicplayer-mobile');
                
                // 根据窗口大小添加相应的类
                if (this._windowSize.width < 400) {
                    container.classList.add('musicplayer-mobile');
                } else if (this._windowSize.width < 600) {
                    container.classList.add('musicplayer-small');
                } else if (this._windowSize.width < 800) {
                    container.classList.add('musicplayer-medium');
                }
            }
            
            // 更新沉浸式播放UI的样式类
            if (this._immersiveView) {
                this._updateImmersiveViewLayout();
            }
        },
        
        _updateImmersiveViewLayout: function() {
            // 响应式布局现在完全由CSS控制，不需要JavaScript干预
            // 保留此方法以保持兼容性，但不再需要手动添加类或修改样式
            if (!this._immersiveView || !this._windowSize.width || !this._windowSize.height) return;
            
            // CSS Grid 和容器查询会自动处理布局
            // 所有尺寸都使用 clamp() 和相对单位，会自动适应窗口大小
        },
        
        // ========== 收藏功能 ==========
        
        // 添加收藏
        async _addToFavorites(rid) {
            const ridStr = String(rid);
            if (!this._favorites.includes(ridStr)) {
                this._favorites.push(ridStr);
                
                // 如果当前正在播放该歌曲，确保歌曲信息已保存到缓存
                if (this._currentSong && String(this._currentSong.rid) === ridStr) {
                    if (this._currentSong.name && this._currentSong.name !== '未知歌曲' &&
                        this._currentSong.artist && this._currentSong.artist !== '未知艺术家') {
                        if (!this._songInfoCache[ridStr]) {
                            this._songInfoCache[ridStr] = {};
                        }
                        this._songInfoCache[ridStr].name = this._currentSong.name;
                        this._songInfoCache[ridStr].artist = this._currentSong.artist;
                        this._songInfoCache[ridStr].album = this._currentSong.album || '';
                        // 保留已有的歌词
                        if (!this._songInfoCache[ridStr].lyrics) {
                            this._songInfoCache[ridStr].lyrics = null;
                        }
                    }
                }
                
                await this._saveSettings();
                this._showMessage('已添加到收藏');
                this._updateFavoriteButton();
            }
        },
        
        // 取消收藏
        async _removeFromFavorites(rid) {
            const index = this._favorites.indexOf(String(rid));
            if (index > -1) {
                this._favorites.splice(index, 1);
                await this._saveSettings();
                this._showMessage('已取消收藏');
                this._updateFavoriteButton();
            }
        },
        
        // 检查是否已收藏
        _isFavorite(rid) {
            return this._favorites.includes(String(rid));
        },
        
        // 更新收藏按钮
        _updateFavoriteButton() {
            if (!this._currentSong) return;
            const favoriteBtn = this.window?.querySelector('.favorite-btn');
            if (favoriteBtn) {
                const isFav = this._isFavorite(this._currentSong.rid);
                favoriteBtn.innerHTML = isFav ? '❤️' : '🤍';
                favoriteBtn.title = isFav ? '取消收藏' : '收藏';
            }
        },
        
        // 加载收藏列表
        async _loadFavorites() {
            try {
                if (this._favorites.length === 0) {
                    this._defaultContent.innerHTML = `
                        <div style="text-align: center; padding: 60px 20px; color: #999;">
                            <div style="font-size: 48px; margin-bottom: 20px;">🎵</div>
                            <div style="font-size: 16px;">暂无收藏的歌曲</div>
                        </div>
                    `;
                    return;
                }
                
                // 获取所有收藏歌曲的信息
                const favoriteSongs = [];
                for (const rid of this._favorites) {
                    try {
                        const songInfo = await this._fetchSongInfo(rid);
                        favoriteSongs.push(songInfo);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', `获取收藏歌曲 ${rid} 信息失败`, e);
                        }
                    }
                }
                
                this._defaultContent.innerHTML = `
                    <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">我的收藏 (${favoriteSongs.length})</h2>
                    <div class="favorites-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                        ${favoriteSongs.map((song, index) => `
                            <div class="favorite-item" data-rid="${song.rid}" style="
                                display: flex;
                                align-items: center;
                                padding: 12px 20px;
                                border-bottom: 1px solid #333;
                                cursor: pointer;
                                transition: background 0.2s;
                            ">
                                <img src="${song.pic ? (song.pic + (song.pic.includes('?') ? '&' : '?') + '_t=' + Date.now()) : ''}" style="
                                    width: 50px;
                                    height: 50px;
                                    border-radius: 4px;
                                    object-fit: cover;
                                    margin-right: 15px;
                                " onerror="this.style.display='none';" onload="this.style.display='block';">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                    <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist}${song.album ? ' - ' + song.album : ''}</div>
                                </div>
                                <button class="remove-favorite-btn" data-rid="${song.rid}" style="
                                    background: transparent;
                                    border: none;
                                    color: #ec4141;
                                    cursor: pointer;
                                    padding: 8px;
                                    font-size: 18px;
                                    margin-left: 10px;
                                " title="取消收藏">❤️</button>
                            </div>
                        `).join('')}
                    </div>
                `;
                
                // 绑定点击事件（使用事件委托，避免作用域问题）
                // 先移除旧的事件监听器（如果存在）
                const oldClickHandler = this._defaultContent._favoriteClickHandler;
                if (oldClickHandler) {
                    this._defaultContent.removeEventListener('click', oldClickHandler);
                }
                
                // 创建新的事件处理函数
                const clickHandler = async (e) => {
                    // 检查是否点击了收藏项（但不是删除按钮）
                    const favoriteItem = e.target.closest('.favorite-item');
                    if (!favoriteItem) {
                        return;
                    }
                    
                    // 如果点击的是删除按钮，不播放
                    if (e.target.closest('.remove-favorite-btn')) {
                        return;
                    }
                    
                    // 防止事件冒泡
                    e.stopPropagation();
                    e.preventDefault();
                    
                    const rid = favoriteItem.dataset.rid;
                    if (!rid) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '收藏项缺少 rid 属性');
                        }
                        return;
                    }
                    
                    // 查找歌曲（确保rid类型匹配）
                    const song = favoriteSongs.find(s => String(s.rid) === String(rid));
                    if (song) {
                        try {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('MusicPlayer', `播放收藏歌曲: ${song.name} (${song.rid})`);
                            }
                            // 确保歌曲信息完整后再播放
                            await this._playSong(song);
                        } catch (error) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('MusicPlayer', '播放收藏歌曲失败', error);
                            }
                            // 如果程序正在退出，不显示错误消息
                            if (!this._isExiting) {
                                this._showMessage('播放失败，请稍后重试');
                            }
                        }
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', `未找到收藏歌曲: ${rid}，尝试直接使用rid播放`);
                        }
                        // 如果找不到，尝试直接使用rid播放
                        try {
                            await this._playSong(rid);
                        } catch (error) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('MusicPlayer', '播放收藏歌曲失败', error);
                            }
                            // 如果程序正在退出，不显示错误消息
                            if (!this._isExiting) {
                                this._showMessage('播放失败，请稍后重试');
                            }
                        }
                    }
                };
                
                // 保存事件处理函数引用，以便后续移除
                this._defaultContent._favoriteClickHandler = clickHandler;
                this._defaultContent.addEventListener('click', clickHandler, true); // 使用捕获阶段
                
                // 绑定悬停效果（直接绑定到每个item）
                this._defaultContent.querySelectorAll('.favorite-item').forEach(item => {
                    // 移除旧的悬停事件监听器（如果存在）
                    const oldMouseEnter = item._mouseEnterHandler;
                    const oldMouseLeave = item._mouseLeaveHandler;
                    if (oldMouseEnter) {
                        item.removeEventListener('mouseenter', oldMouseEnter);
                    }
                    if (oldMouseLeave) {
                        item.removeEventListener('mouseleave', oldMouseLeave);
                    }
                    
                    // 创建新的悬停事件处理函数
                    const mouseEnterHandler = () => {
                        item.style.background = '#2a2a2a';
                    };
                    const mouseLeaveHandler = () => {
                        item.style.background = 'transparent';
                    };
                    
                    // 保存引用
                    item._mouseEnterHandler = mouseEnterHandler;
                    item._mouseLeaveHandler = mouseLeaveHandler;
                    
                    item.addEventListener('mouseenter', mouseEnterHandler);
                    item.addEventListener('mouseleave', mouseLeaveHandler);
                });
                
                // 绑定删除按钮
                this._defaultContent.querySelectorAll('.remove-favorite-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const rid = btn.dataset.rid;
                        await this._removeFromFavorites(rid);
                        await this._loadFavorites(); // 重新加载列表
                    });
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载收藏列表失败', e);
                }
                this._showMessage('加载收藏列表失败');
            }
        },
        
        // ========== 歌单功能 ==========
        
        // 创建歌单
        async _createPlaylist(name) {
            const playlistId = 'playlist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const newPlaylist = {
                id: playlistId,
                name: name,
                songIds: []
            };
            this._playlists.push(newPlaylist);
            await this._saveSettings();
            return newPlaylist;
        },
        
        // 删除歌单
        async _deletePlaylist(playlistId) {
            const index = this._playlists.findIndex(p => p.id === playlistId);
            if (index > -1) {
                this._playlists.splice(index, 1);
                await this._saveSettings();
            }
        },
        
        // 向歌单添加歌曲
        async _addSongToPlaylist(playlistId, rid) {
            const playlist = this._playlists.find(p => p.id === playlistId);
            if (playlist && !playlist.songIds.includes(String(rid))) {
                playlist.songIds.push(String(rid));
                await this._saveSettings();
            }
        },
        
        // 从歌单移除歌曲
        async _removeSongFromPlaylist(playlistId, rid) {
            const playlist = this._playlists.find(p => p.id === playlistId);
            if (playlist) {
                const index = playlist.songIds.indexOf(String(rid));
                if (index > -1) {
                    playlist.songIds.splice(index, 1);
                    await this._saveSettings();
                }
            }
        },
        
        // 加载歌单列表
        async _loadPlaylistsView() {
            try {
                this._defaultContent.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-size: 20px; color: #e0e0e0;">我的歌单 (${this._playlists.length})</h2>
                        <button id="create-playlist-btn" style="
                            padding: 8px 16px;
                            background: #ec4141;
                            color: #fff;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        ">创建歌单</button>
                    </div>
                    <div class="playlists-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
                        ${this._playlists.map(playlist => `
                            <div class="playlist-card" data-id="${playlist.id}" style="
                                background: #252525;
                                border-radius: 8px;
                                padding: 16px;
                                cursor: pointer;
                                transition: transform 0.2s, background 0.2s;
                            ">
                                <div style="font-size: 18px; margin-bottom: 8px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${playlist.name}</div>
                                <div style="font-size: 12px; color: #999; margin-bottom: 12px;">${playlist.songIds.length} 首歌曲</div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="play-playlist-btn" data-id="${playlist.id}" style="
                                        flex: 1;
                                        padding: 6px 12px;
                                        background: #ec4141;
                                        color: #fff;
                                        border: none;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    ">播放</button>
                                    <button class="delete-playlist-btn" data-id="${playlist.id}" style="
                                        padding: 6px 12px;
                                        background: #2a2a2a;
                                        color: #e0e0e0;
                                        border: none;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    ">删除</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ${this._playlists.length === 0 ? `
                        <div style="text-align: center; padding: 60px 20px; color: #999;">
                            <div style="font-size: 48px; margin-bottom: 20px;">📋</div>
                            <div style="font-size: 16px;">暂无歌单，点击"创建歌单"开始创建</div>
                        </div>
                    ` : ''}
                `;
                
                // 绑定创建歌单按钮
                const createBtn = this._defaultContent.querySelector('#create-playlist-btn');
                if (createBtn) {
                    createBtn.addEventListener('click', () => {
                        this._showCreatePlaylistDialog();
                    });
                }
                
                // 绑定播放按钮
                this._defaultContent.querySelectorAll('.play-playlist-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const playlistId = btn.dataset.id;
                        await this._playPlaylist(playlistId);
                    });
                });
                
                // 绑定删除按钮
                this._defaultContent.querySelectorAll('.delete-playlist-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const playlistId = btn.dataset.id;
                        if (confirm('确定要删除这个歌单吗？')) {
                            await this._deletePlaylist(playlistId);
                            await this._loadPlaylistsView();
                        }
                    });
                });
                
                // 绑定歌单卡片点击
                this._defaultContent.querySelectorAll('.playlist-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('button')) return;
                        const playlistId = card.dataset.id;
                        this._loadPlaylistDetail(playlistId);
                    });
                    
                    card.addEventListener('mouseenter', () => {
                        card.style.background = '#2a2a2a';
                        card.style.transform = 'translateY(-2px)';
                    });
                    card.addEventListener('mouseleave', () => {
                        card.style.background = '#252525';
                        card.style.transform = 'translateY(0)';
                    });
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌单列表失败', e);
                }
                this._showMessage('加载歌单列表失败');
            }
        },
        
        // 显示创建歌单对话框
        _showCreatePlaylistDialog() {
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            `;
            
            const content = document.createElement('div');
            content.style.cssText = `
                background: #1e1e1e;
                border-radius: 12px;
                padding: 24px;
                min-width: 300px;
                max-width: 400px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            `;
            
            content.innerHTML = `
                <div style="font-size: 18px; font-weight: 600; color: #e0e0e0; margin-bottom: 20px;">创建歌单</div>
                <input type="text" id="playlist-name-input" placeholder="请输入歌单名称" style="
                    width: 100%;
                    padding: 10px;
                    background: #2a2a2a;
                    border: 1px solid #333;
                    border-radius: 6px;
                    color: #e0e0e0;
                    font-size: 14px;
                    margin-bottom: 20px;
                    box-sizing: border-box;
                " autofocus>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="create-playlist-cancel" style="
                        padding: 8px 20px;
                        background: #2a2a2a;
                        color: #e0e0e0;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">取消</button>
                    <button id="create-playlist-confirm" style="
                        padding: 8px 20px;
                        background: #ec4141;
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">创建</button>
                </div>
            `;
            
            dialog.appendChild(content);
            document.body.appendChild(dialog);
            
            // 安全移除对话框的辅助函数
            const safeRemoveDialog = () => {
                if (dialog && dialog.parentNode === document.body) {
                    try {
                        document.body.removeChild(dialog);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '移除对话框失败', e);
                        }
                        if (dialog.remove) {
                            dialog.remove();
                        }
                    }
                }
            };
            
            // 取消按钮
            content.querySelector('#create-playlist-cancel').addEventListener('click', () => {
                safeRemoveDialog();
            });
            
            // 确认按钮
            content.querySelector('#create-playlist-confirm').addEventListener('click', async () => {
                try {
                    const nameInput = content.querySelector('#playlist-name-input');
                    const name = nameInput.value.trim();
                    if (name) {
                        await this._createPlaylist(name);
                        safeRemoveDialog();
                        await this._loadPlaylistsView();
                        this._showMessage('歌单创建成功');
                    } else {
                        this._showMessage('请输入歌单名称');
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('MusicPlayer', '创建歌单失败', e);
                    }
                    this._showMessage('创建歌单失败: ' + e.message);
                } finally {
                    safeRemoveDialog();
                }
            });
            
            // 回车确认
            content.querySelector('#playlist-name-input').addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    try {
                        const nameInput = content.querySelector('#playlist-name-input');
                        const name = nameInput.value.trim();
                        if (name) {
                            await this._createPlaylist(name);
                            safeRemoveDialog();
                            await this._loadPlaylistsView();
                            this._showMessage('歌单创建成功');
                        }
                    } catch (err) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', '创建歌单失败', err);
                        }
                        this._showMessage('创建歌单失败: ' + err.message);
                    } finally {
                        safeRemoveDialog();
                    }
                }
            });
        },
        
        // 加载歌单详情（支持推荐歌单和用户创建的歌单）
        async _loadPlaylistDetail(playlistId) {
            try {
                // 判断是用户创建的歌单（ID格式：playlist_xxx）还是推荐歌单（数字ID）
                const isUserPlaylist = playlistId && playlistId.startsWith('playlist_');
                
                if (isUserPlaylist) {
                    // 加载用户创建的歌单详情
                    await this._loadUserPlaylistDetail(playlistId);
                } else {
                    // 加载推荐歌单详情（通过API）
                    await this._loadRecommendedPlaylistDetail(playlistId);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌单详情失败', e);
                }
                this._showMessage('加载歌单详情失败');
            }
        },
        
        // 加载推荐歌单详情（通过API）
        async _loadRecommendedPlaylistDetail(playlistId, page = 1) {
            try {
                // 更新分页状态
                this._pagination.currentPage = page;
                this._pagination.currentType = 'playlistSongs';
                this._pagination.currentPlaylistId = playlistId;
                
                const url = `${this.API_BASE}?id=${playlistId}&page=${page}&limit=${this._pagination.pageSize}&type=list`;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('MusicPlayer', `加载推荐歌单详情，URL: ${url}`);
                }
                
                const response = await this._fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('MusicPlayer', 'API响应数据', data);
                }
                
                // 检查响应格式
                if (data.code !== 200) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('MusicPlayer', `API返回错误码: ${data.code}, 消息: ${data.msg || data.message}`);
                    }
                    this._showMessage(data.msg || data.message || '加载歌单详情失败');
                    return;
                }
                
                // 处理API响应格式
                // 实际响应格式: { code: 200, msg: "...", data: { id, name, musicList: [...] } }
                let songs = [];
                let playlistName = '歌单';
                let playlistInfo = null;
                
                if (data.data) {
                    // 标准格式: data.data.musicList (根据实际API响应)
                    if (data.data.musicList && Array.isArray(data.data.musicList)) {
                        songs = data.data.musicList;
                        playlistName = data.data.name || playlistName;
                        playlistInfo = data.data;
                    }
                    // 备用格式1: data.data 直接是数组
                    else if (Array.isArray(data.data)) {
                        songs = data.data;
                    }
                    // 备用格式2: data.data.list
                    else if (data.data.list && Array.isArray(data.data.list)) {
                        songs = data.data.list;
                        playlistName = data.data.name || playlistName;
                        playlistInfo = data.data;
                    }
                    // 备用格式3: data.data.songs
                    else if (data.data.songs && Array.isArray(data.data.songs)) {
                        songs = data.data.songs;
                        playlistName = data.data.name || playlistName;
                        playlistInfo = data.data;
                    }
                }
                
                // 更新分页信息
                if (data.total !== undefined) {
                    this._pagination.total = data.total;
                    this._pagination.totalPages = Math.ceil(data.total / this._pagination.pageSize);
                } else if (playlistInfo && playlistInfo.total !== undefined) {
                    this._pagination.total = playlistInfo.total;
                    this._pagination.totalPages = Math.ceil(playlistInfo.total / this._pagination.pageSize);
                } else {
                    this._pagination.totalPages = songs.length === this._pagination.pageSize ? page + 1 : page;
                }
                
                if (songs.length > 0) {
                    const paginationHtml = this._createPaginationHTML('playlistSongs', page);
                    const startIndex = (page - 1) * this._pagination.pageSize;
                    
                    this._defaultContent.innerHTML = `
                        <div style="margin-bottom: 20px;">
                            <button class="back-button" style="
                                padding: 8px 16px;
                                background: #2a2a2a;
                                border: none;
                                border-radius: 4px;
                                color: #e0e0e0;
                                cursor: pointer;
                                margin-bottom: 20px;
                            ">← 返回</button>
                            <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #e0e0e0;">${playlistName}</h2>
                            <div style="font-size: 12px; color: #999;">
                                ${this._pagination.total || songs.length} 首歌曲
                                ${playlistInfo && playlistInfo.desc ? ` · ${playlistInfo.desc}` : ''}
                                ${playlistInfo && playlistInfo.PlayCnt ? ` · 播放 ${(playlistInfo.PlayCnt / 10000).toFixed(1)}万次` : ''}
                            </div>
                        </div>
                        <div class="playlist-detail-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                            ${songs.map((song, index) => `
                                <div class="playlist-detail-item" data-rid="${song.rid}" style="
                                    display: flex;
                                    align-items: center;
                                    padding: 12px 20px;
                                    border-bottom: 1px solid #333;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">
                                    <div style="width: 30px; text-align: center; font-size: 14px; color: #999;">${startIndex + index + 1}</div>
                                    <img src="${song.pic || ''}" style="
                                        width: 50px;
                                        height: 50px;
                                        border-radius: 4px;
                                        object-fit: cover;
                                        margin: 0 15px;
                                    " onerror="this.style.display='none';">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name || '未知歌曲'}</div>
                                        <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist || '未知艺术家'}${song.album ? ' - ' + song.album : ''}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${paginationHtml}
                    `;
                    
                    // 返回按钮
                    const backBtn = this._defaultContent.querySelector('.back-button');
                    if (backBtn) {
                        backBtn.addEventListener('click', () => {
                            this._loadPlaylists();
                        });
                    }
                    
                    // 绑定分页事件
                    this._bindPaginationEvents('playlistSongs');
                    
                    // 绑定点击事件
                    this._defaultContent.querySelectorAll('.playlist-detail-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                            const rid = item.dataset.rid;
                            // 从原始数据中获取歌曲信息（API已返回完整信息，包括url和lrc）
                            const songData = songs[index];
                            if (songData) {
                                // API响应中已经包含了url和lrc字段，直接使用
                                const song = {
                                    rid: songData.rid || rid,
                                    name: songData.name || '未知歌曲',
                                    artist: songData.artist || '未知艺术家',
                                    album: songData.album || '',
                                    pic: songData.pic || '',
                                    // 优先使用API返回的url和lrc，如果没有则手动构建
                                    url: songData.url || `${this.API_BASE}?id=${songData.rid || rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: songData.lrc || `${this.API_BASE}?id=${songData.rid || rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            } else {
                                // 如果原始数据不可用，从DOM提取（备用方案）
                                const nameEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 14px"]');
                                const artistEl = item.querySelector('div[style*="flex: 1"] > div[style*="font-size: 12px"]');
                                const imgEl = item.querySelector('img');
                                
                                const song = {
                                    rid: rid,
                                    name: nameEl ? nameEl.textContent.trim() : '未知歌曲',
                                    artist: artistEl ? artistEl.textContent.trim().split(' - ')[0] : '未知艺术家',
                                    pic: imgEl && imgEl.src ? imgEl.src : '',
                                    url: `${this.API_BASE}?id=${rid}&type=song&level=exhigh&format=mp3`,
                                    lrc: `${this.API_BASE}?id=${rid}&type=lyr&format=all`
                                };
                                this._playSong(song);
                            }
                        });
                        item.addEventListener('mouseenter', () => {
                            item.style.background = '#2a2a2a';
                        });
                        item.addEventListener('mouseleave', () => {
                            item.style.background = 'transparent';
                        });
                    });
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', '歌单为空或数据格式不正确，响应数据', data);
                    }
                    this._defaultContent.innerHTML = `
                        <div style="margin-bottom: 20px;">
                            <button class="back-button" style="
                                padding: 8px 16px;
                                background: #2a2a2a;
                                border: none;
                                border-radius: 4px;
                                color: #e0e0e0;
                                cursor: pointer;
                                margin-bottom: 20px;
                            ">← 返回</button>
                            <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #e0e0e0;">歌单不存在</h2>
                            <div style="font-size: 12px; color: #999;">该歌单可能已被删除或不存在</div>
                        </div>
                    `;
                    
                    const backBtn = this._defaultContent.querySelector('.back-button');
                    if (backBtn) {
                        backBtn.addEventListener('click', () => {
                            this._loadPlaylists();
                        });
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载推荐歌单详情失败', e);
                    KernelLogger.error('MusicPlayer', '错误堆栈', e.stack);
                }
                this._defaultContent.innerHTML = `
                    <div style="margin-bottom: 20px;">
                        <button class="back-button" style="
                            padding: 8px 16px;
                            background: #2a2a2a;
                            border: none;
                            border-radius: 4px;
                            color: #e0e0e0;
                            cursor: pointer;
                            margin-bottom: 20px;
                        ">← 返回</button>
                        <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #e0e0e0;">加载失败</h2>
                        <div style="font-size: 12px; color: #999;">${e.message || '请稍后重试'}</div>
                    </div>
                `;
                
                const backBtn = this._defaultContent.querySelector('.back-button');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        this._loadPlaylists();
                    });
                }
                this._showMessage('加载失败，请稍后重试');
            }
        },
        
        // 加载用户创建的歌单详情
        async _loadUserPlaylistDetail(playlistId) {
            try {
                const playlist = this._playlists.find(p => p.id === playlistId);
                if (!playlist) {
                    this._showMessage('歌单不存在');
                    return;
                }
                
                if (playlist.songIds.length === 0) {
                    this._defaultContent.innerHTML = `
                        <div style="margin-bottom: 20px;">
                            <button id="back-to-playlists" style="
                                padding: 8px 16px;
                                background: #2a2a2a;
                                color: #e0e0e0;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                margin-bottom: 20px;
                            ">← 返回</button>
                            <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #e0e0e0;">${playlist.name}</h2>
                        </div>
                        <div style="text-align: center; padding: 60px 20px; color: #999;">
                            <div style="font-size: 48px; margin-bottom: 20px;">🎵</div>
                            <div style="font-size: 16px;">歌单为空</div>
                        </div>
                    `;
                    
                    const backBtn = this._defaultContent.querySelector('#back-to-playlists');
                    if (backBtn) {
                        backBtn.addEventListener('click', () => {
                            this._loadPlaylistsView();
                        });
                    }
                    return;
                }
                
                // 获取所有歌曲信息
                const songs = [];
                for (const rid of playlist.songIds) {
                    try {
                        const songInfo = await this._fetchSongInfo(rid);
                        songs.push(songInfo);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', `获取歌单歌曲 ${rid} 信息失败`, e);
                        }
                    }
                }
                
                this._defaultContent.innerHTML = `
                    <div style="margin-bottom: 20px;">
                        <button id="back-to-playlists" style="
                            padding: 8px 16px;
                            background: #2a2a2a;
                            color: #e0e0e0;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            margin-bottom: 20px;
                        ">← 返回</button>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 20px; color: #e0e0e0;">${playlist.name} (${songs.length})</h2>
                            <button id="play-all-btn" data-id="${playlistId}" style="
                                padding: 8px 16px;
                                background: #ec4141;
                                color: #fff;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                            ">播放全部</button>
                        </div>
                    </div>
                    <div class="playlist-detail-list" style="background: #252525; border-radius: 8px; overflow: hidden;">
                        ${songs.map((song, index) => `
                            <div class="playlist-detail-item" data-rid="${song.rid}" style="
                                display: flex;
                                align-items: center;
                                padding: 12px 20px;
                                border-bottom: 1px solid #333;
                                cursor: pointer;
                                transition: background 0.2s;
                            ">
                                <div style="width: 30px; text-align: center; color: #999; font-size: 14px;">${index + 1}</div>
                                <img src="${song.pic ? (song.pic + (song.pic.includes('?') ? '&' : '?') + '_t=' + Date.now()) : ''}" style="
                                    width: 50px;
                                    height: 50px;
                                    border-radius: 4px;
                                    object-fit: cover;
                                    margin: 0 15px;
                                " onerror="this.style.display='none';" onload="this.style.display='block';">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.name}</div>
                                    <div style="font-size: 12px; color: #999; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist}${song.album ? ' - ' + song.album : ''}</div>
                                </div>
                                <button class="remove-from-playlist-btn" data-rid="${song.rid}" data-playlist-id="${playlistId}" style="
                                    background: transparent;
                                    border: none;
                                    color: #ec4141;
                                    cursor: pointer;
                                    padding: 8px;
                                    font-size: 18px;
                                    margin-left: 10px;
                                " title="从歌单移除">🗑️</button>
                            </div>
                        `).join('')}
                    </div>
                `;
                
                // 绑定返回按钮
                const backBtn = this._defaultContent.querySelector('#back-to-playlists');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        this._loadPlaylistsView();
                    });
                }
                
                // 绑定播放全部按钮
                const playAllBtn = this._defaultContent.querySelector('#play-all-btn');
                if (playAllBtn) {
                    playAllBtn.addEventListener('click', async () => {
                        await this._playPlaylist(playlistId);
                    });
                }
                
                // 绑定歌曲点击
                this._defaultContent.querySelectorAll('.playlist-detail-item').forEach(item => {
                    const rid = item.dataset.rid;
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.remove-from-playlist-btn')) return;
                        const song = songs.find(s => s.rid === rid);
                        if (song) {
                            this._playSong(song);
                        }
                    });
                    
                    item.addEventListener('mouseenter', () => {
                        item.style.background = '#2a2a2a';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = 'transparent';
                    });
                });
                
                // 绑定移除按钮
                this._defaultContent.querySelectorAll('.remove-from-playlist-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const rid = btn.dataset.rid;
                        const playlistId = btn.dataset.playlistId;
                        await this._removeSongFromPlaylist(playlistId, rid);
                        await this._loadPlaylistDetail(playlistId); // 重新加载
                    });
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '加载歌单详情失败', e);
                }
                this._showMessage('加载歌单详情失败');
            }
        },
        
        // 播放歌单
        async _playPlaylist(playlistId) {
            try {
                const playlist = this._playlists.find(p => p.id === playlistId);
                if (!playlist || playlist.songIds.length === 0) {
                    this._showMessage('歌单为空');
                    return;
                }
                
                // 清空当前播放列表
                this._playlist = [];
                
                // 获取所有歌曲信息并添加到播放列表
                for (const rid of playlist.songIds) {
                    try {
                        const songInfo = await this._fetchSongInfo(rid);
                        this._playlist.push(songInfo);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', `获取歌单歌曲 ${rid} 信息失败`, e);
                        }
                    }
                }
                
                // 播放第一首
                if (this._playlist.length > 0) {
                    this._currentIndex = 0;
                    await this._playSong(this._playlist[0]);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '播放歌单失败', e);
                }
                this._showMessage('播放歌单失败');
            }
        },
        
        // 显示添加到歌单对话框
        _showAddToPlaylistDialog(rid) {
            if (this._playlists.length === 0) {
                this._showMessage('请先创建歌单');
                return;
            }
            
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            `;
            
            const content = document.createElement('div');
            content.style.cssText = `
                background: #1e1e1e;
                border-radius: 12px;
                padding: 24px;
                min-width: 300px;
                max-width: 400px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            `;
            
            content.innerHTML = `
                <div style="font-size: 18px; font-weight: 600; color: #e0e0e0; margin-bottom: 20px;">添加到歌单</div>
                <div class="playlist-select-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
                    ${this._playlists.map(playlist => `
                        <div class="playlist-select-item" data-id="${playlist.id}" style="
                            padding: 12px;
                            background: #2a2a2a;
                            border-radius: 6px;
                            margin-bottom: 8px;
                            cursor: pointer;
                            transition: background 0.2s;
                        ">
                            <div style="font-size: 14px; color: #e0e0e0;">${playlist.name}</div>
                            <div style="font-size: 12px; color: #999; margin-top: 4px;">${playlist.songIds.length} 首歌曲</div>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button id="add-to-playlist-cancel" style="
                        padding: 8px 20px;
                        background: #2a2a2a;
                        color: #e0e0e0;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">取消</button>
                </div>
            `;
            
            dialog.appendChild(content);
            document.body.appendChild(dialog);
            
            // 安全移除对话框的辅助函数
            const safeRemoveDialog = () => {
                if (dialog && dialog.parentNode === document.body) {
                    try {
                        document.body.removeChild(dialog);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '移除对话框失败', e);
                        }
                        if (dialog.remove) {
                            dialog.remove();
                        }
                    }
                }
            };
            
            // 绑定歌单选择
            content.querySelectorAll('.playlist-select-item').forEach(item => {
                item.addEventListener('click', async () => {
                    try {
                        const playlistId = item.dataset.id;
                        await this._addSongToPlaylist(playlistId, rid);
                        safeRemoveDialog();
                        this._showMessage('已添加到歌单');
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('MusicPlayer', '添加到歌单失败', e);
                        }
                        this._showMessage('添加到歌单失败: ' + e.message);
                    } finally {
                        safeRemoveDialog();
                    }
                });
                
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#333';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = '#2a2a2a';
                });
            });
            
            // 取消按钮
            content.querySelector('#add-to-playlist-cancel').addEventListener('click', () => {
                safeRemoveDialog();
            });
        },
        
        __info__: function() {
            return {
                name: '音乐Music',
                type: 'GUI',
                version: '1.0.0',
                description: '高仿网易云音乐风格的在线音乐播放器',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                category: 'other',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,   // 读取程序设置和缓存
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE  // 保存程序设置和缓存
                ] : []
            };
        },
        
        __exit__: function() {
            this._cleanup();
        },
        
        // 清理资源
        _cleanup: function() {
            try {
                // 清理事件处理器
                if (this._resizeHandlerId && typeof EventManager !== 'undefined') {
                    EventManager.unregisterEventHandler(this._resizeHandlerId);
                    this._resizeHandlerId = null;
                }
                
                // 清理所有事件处理器（通过 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    EventManager.unregisterAllHandlersForPid(this.pid);
                }
                
                // 设置退出标志，防止后续操作
                this._isExiting = true;
                
                // 停止音频播放
                if (this._audio) {
                    try {
                        this._audio.pause();
                        this._audio.src = '';
                        this._audio.load();
                        
                        // 移除所有事件监听器（通过克隆元素）
                        const newAudio = this._audio.cloneNode(false);
                        if (this._audio.parentNode) {
                            this._audio.parentNode.replaceChild(newAudio, this._audio);
                        }
                        this._audio = null;
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '清理音频失败', e);
                        }
                    }
                }
                
                // 停止进度更新定时器
                if (this._progressUpdateTimer) {
                    clearInterval(this._progressUpdateTimer);
                    this._progressUpdateTimer = null;
                }
                
                // 移除通知依赖
                this._removeNotificationDependent();
                
                // 清理桌面组件
                if (this._desktopComponentId && typeof DesktopManager !== 'undefined') {
                    try {
                        DesktopManager.removeComponent(this._desktopComponentId);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '清理桌面组件失败', e);
                        }
                    }
                    this._desktopComponentId = null;
                    this._desktopComponent = null;
                }
                
                // 清理UI引用
                this._leftSidebar = null;
                this._mainContent = null;
                this._playerBar = null;
                this._searchInput = null;
                this._searchResults = null;
                this._playlistView = null;
                this._lyricsView = null;
                this._immersiveView = null;
                this._playerCover = null;
                this._playerSongName = null;
                this._playerArtistName = null;
                
                // 清理状态
                this._currentSong = null;
                this._playlist = [];
                this._isPlaying = false;
                this._isLoading = false;
                
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '清理资源失败', e);
                }
            }
        }
    };
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.MUSICPLAYER = MUSICPLAYER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.MUSICPLAYER = MUSICPLAYER;
    }
    
})(window);