// ZerOS 锁屏界面驱动
// Windows 11 风格登录界面
// 负责在内核加载完成后显示锁屏界面，用户登录后进入系统

KernelLogger.info("LockScreen", "模块初始化");

(function(window) {
    'use strict';
    
    class LockScreen {
        static container = null;
        static currentUser = null;
        static passwordInput = null;
        static loginButton = null;
        static isPasswordMode = false;
        static _initialized = false;
        static _checkInterval = null;
        static _loadingOverlay = null;
        static _isLoading = false;
        static _userList = [];
        static _currentUserIndex = 0;
        static _userSwitchButton = null;
        static _userListContainer = null;
        static _showUserList = false;
        
        /**
         * 初始化锁屏界面
         */
        static init() {
            if (LockScreen._initialized) {
                KernelLogger.debug("LockScreen", "锁屏界面已初始化，跳过重复初始化");
                return;
            }
            
            LockScreen._initialized = true;
            KernelLogger.info("LockScreen", "初始化锁屏界面");
            
            // 创建锁屏容器
            LockScreen.container = document.createElement('div');
            LockScreen.container.id = 'lockscreen';
            LockScreen.container.className = 'lockscreen';
            
            // 设置随机背景
            LockScreen._setRandomBackground();
            
            // 创建锁屏内容
            LockScreen._createLockScreenContent();
            
            // 添加到页面
            document.body.appendChild(LockScreen.container);
            
            // 监听键盘事件
            LockScreen._setupKeyboardListeners();
            
            // 更新时间和用户信息
            LockScreen._updateTime();
            LockScreen._updateUserInfo();
            setInterval(() => LockScreen._updateTime(), 1000);
        }
        
        /**
         * 设置随机背景
         */
        static _setRandomBackground() {
            const backgrounds = ['bg1.jpg', 'bg2.jpg', 'bg3.jpg'];
            const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
            const bgPath = `/system/assets/start/${randomBg}`;
            
            LockScreen.container.style.backgroundImage = `url(${bgPath})`;
            LockScreen.container.style.backgroundSize = 'cover';
            LockScreen.container.style.backgroundPosition = 'center';
            LockScreen.container.style.backgroundRepeat = 'no-repeat';
        }
        
        /**
         * 创建锁屏内容
         */
        static _createLockScreenContent() {
            // 时间显示区域（左上角）
            const timeContainer = document.createElement('div');
            timeContainer.className = 'lockscreen-time-container';
            
            const timeDisplay = document.createElement('div');
            timeDisplay.className = 'lockscreen-time';
            timeDisplay.id = 'lockscreen-time';
            timeDisplay.textContent = '00:00';
            
            const dateDisplay = document.createElement('div');
            dateDisplay.className = 'lockscreen-date';
            dateDisplay.id = 'lockscreen-date';
            dateDisplay.textContent = '2024年1月1日 星期一';
            
            timeContainer.appendChild(timeDisplay);
            timeContainer.appendChild(dateDisplay);
            LockScreen.container.appendChild(timeContainer);
            
            // 用户登录区域（居中偏下）
            const loginContainer = document.createElement('div');
            loginContainer.className = 'lockscreen-login-container';
            
            // 用户头像
            const avatar = document.createElement('div');
            avatar.className = 'lockscreen-avatar';
            avatar.innerHTML = `
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9"/>
                    <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.9"/>
                </svg>
            `;
            loginContainer.appendChild(avatar);
            
            // 用户名容器（包含用户名和切换按钮）
            const userNameContainer = document.createElement('div');
            userNameContainer.className = 'lockscreen-username-container';
            userNameContainer.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                position: relative;
            `;
            
            // 用户名
            const userName = document.createElement('div');
            userName.className = 'lockscreen-username';
            userName.id = 'lockscreen-username';
            userName.textContent = '用户';
            userNameContainer.appendChild(userName);
            
            // 用户切换按钮（如果有多个用户）
            const userSwitchButton = document.createElement('button');
            userSwitchButton.className = 'lockscreen-user-switch';
            userSwitchButton.id = 'lockscreen-user-switch';
            userSwitchButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 17L21 12L16 7M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            userSwitchButton.style.cssText = `
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.8);
                display: none;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.3s ease;
                outline: none;
                flex-shrink: 0;
            `;
            userSwitchButton.addEventListener('click', (e) => {
                e.stopPropagation();
                LockScreen._toggleUserList();
            });
            LockScreen._userSwitchButton = userSwitchButton;
            userNameContainer.appendChild(userSwitchButton);
            
            loginContainer.appendChild(userNameContainer);
            
            // 用户列表容器（初始隐藏）
            const userListContainer = document.createElement('div');
            userListContainer.className = 'lockscreen-user-list';
            userListContainer.id = 'lockscreen-user-list';
            userListContainer.style.cssText = `
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                margin-top: 12px;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                padding: 8px;
                min-width: 200px;
                display: none;
                flex-direction: column;
                gap: 4px;
                z-index: 20002;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            `;
            LockScreen._userListContainer = userListContainer;
            userNameContainer.appendChild(userListContainer);
            
            // 密码输入区域（初始隐藏）
            const passwordContainer = document.createElement('div');
            passwordContainer.className = 'lockscreen-password-container';
            passwordContainer.id = 'lockscreen-password-container';
            passwordContainer.style.display = 'none';
            
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.className = 'lockscreen-password-input';
            passwordInput.id = 'lockscreen-password-input';
            passwordInput.placeholder = '输入密码';
            passwordInput.autocomplete = 'off';
            LockScreen.passwordInput = passwordInput;
            
            const loginButton = document.createElement('button');
            loginButton.className = 'lockscreen-login-button';
            loginButton.id = 'lockscreen-login-button';
            loginButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            LockScreen.loginButton = loginButton;
            
            passwordContainer.appendChild(passwordInput);
            passwordContainer.appendChild(loginButton);
            loginContainer.appendChild(passwordContainer);
            
            LockScreen.container.appendChild(loginContainer);
            
            // 提示文字（初始显示）
            const hintText = document.createElement('div');
            hintText.className = 'lockscreen-hint';
            hintText.id = 'lockscreen-hint';
            hintText.textContent = '按任意键继续';
            LockScreen.container.appendChild(hintText);
        }
        
        /**
         * 更新时间显示
         */
        static _updateTime() {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            
            const timeEl = document.getElementById('lockscreen-time');
            if (timeEl) {
                timeEl.textContent = `${hours}:${minutes}`;
            }
            
            const dateEl = document.getElementById('lockscreen-date');
            if (dateEl) {
                const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
                const year = now.getFullYear();
                const month = now.getMonth() + 1;
                const date = now.getDate();
                const weekday = weekdays[now.getDay()];
                dateEl.textContent = `${year}年${month}月${date}日 ${weekday}`;
            }
        }
        
        /**
         * 更新用户信息
         */
        static async _updateUserInfo() {
            if (typeof UserControl === 'undefined') {
                // 等待 UserControl 加载
                setTimeout(() => LockScreen._updateUserInfo(), 100);
                return;
            }
            
            try {
                await UserControl.ensureInitialized();
                
                // 获取所有用户
                const users = UserControl.listUsers();
                LockScreen._userList = users;
                
                if (users.length === 0) {
                    return;
                }
                
                // 如果有多个用户，显示切换按钮
                if (users.length > 1 && LockScreen._userSwitchButton) {
                    LockScreen._userSwitchButton.style.display = 'flex';
                } else if (LockScreen._userSwitchButton) {
                    LockScreen._userSwitchButton.style.display = 'none';
                }
                
                // 确保当前用户索引有效
                if (LockScreen._currentUserIndex >= users.length) {
                    LockScreen._currentUserIndex = 0;
                }
                
                // 显示当前用户
                const currentUserData = users[LockScreen._currentUserIndex];
                LockScreen.currentUser = currentUserData.username;
                
                const userNameEl = document.getElementById('lockscreen-username');
                if (userNameEl) {
                    userNameEl.textContent = currentUserData.username;
                }
                
                // 更新用户头像（异步）
                LockScreen._updateUserAvatar(currentUserData).catch(err => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('LockScreen', `更新用户头像失败: ${err.message}`, err);
                    }
                });
                
                // 检查用户是否有密码
                // 优先直接从内存中检查，确保获取最新的密码状态
                let hasPassword = false;
                const userData = UserControl._users?.get(currentUserData.username);
                if (userData) {
                    // 直接从内存中的用户数据检查密码
                    hasPassword = userData.password !== null && 
                                 userData.password !== undefined && 
                                 userData.password !== '';
                } else {
                    // 如果内存中没有，尝试使用listUsers返回的hasPassword字段
                    if (currentUserData.hasPassword !== undefined) {
                        hasPassword = currentUserData.hasPassword;
                    } else {
                        // 最后使用hasPassword方法
                        hasPassword = UserControl.hasPassword(currentUserData.username);
                    }
                }
                
                LockScreen.isPasswordMode = hasPassword;
                
                // 调试日志
                if (typeof KernelLogger !== 'undefined') {
                    const passwordValue = userData?.password;
                    const listUsersHasPassword = currentUserData.hasPassword;
                    KernelLogger.debug('LockScreen', `用户 ${currentUserData.username} 密码状态: ${hasPassword}, listUsers.hasPassword: ${listUsersHasPassword}, 密码哈希: ${passwordValue ? passwordValue.substring(0, 8) + '...' : 'null'}`);
                }
                
                // 更新用户列表
                LockScreen._renderUserList();
                
            } catch (e) {
                KernelLogger.error('LockScreen', `更新用户信息失败: ${e.message}`, e);
            }
        }
        
        /**
         * 更新用户头像
         */
        static async _updateUserAvatar(userData) {
            const avatarEl = document.querySelector('.lockscreen-avatar');
            if (!avatarEl) {
                return;
            }
            
            // 默认SVG
            const defaultSvg = `
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9"/>
                    <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.9"/>
                </svg>
            `;
            
            // 获取最新的用户数据（直接从UserControl获取）
            const userDataFromMemory = UserControl._users && UserControl._users.get ? UserControl._users.get(userData.username) : null;
            const avatarFileName = userDataFromMemory && userDataFromMemory.avatar ? userDataFromMemory.avatar : (userData.avatar || null);
            
            if (avatarFileName) {
                // 使用FSDirve读取本地文件并转换为base64 data URL
                try {
                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                    url.searchParams.set('action', 'read_file');
                    url.searchParams.set('path', 'D:/cache/');
                    url.searchParams.set('fileName', avatarFileName);
                    url.searchParams.set('asBase64', 'true');
                    
                    const response = await fetch(url.toString());
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    if (result.status === 'success' && result.data && result.data.content) {
                        // 确定MIME类型
                        const fileExt = avatarFileName.split('.').pop()?.toLowerCase() || 'jpg';
                        const mimeType = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                                        fileExt === 'png' ? 'image/png' :
                                        fileExt === 'gif' ? 'image/gif' :
                                        fileExt === 'webp' ? 'image/webp' :
                                        fileExt === 'svg' ? 'image/svg+xml' :
                                        fileExt === 'bmp' ? 'image/bmp' : 'image/jpeg';
                        
                        // 使用图片作为头像
                        avatarEl.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = `data:${mimeType};base64,${result.data.content}`;
                        img.style.cssText = `
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 50%;
                        `;
                        img.onerror = () => {
                            // 如果图片加载失败，使用默认SVG
                            avatarEl.innerHTML = defaultSvg;
                        };
                        avatarEl.appendChild(img);
                        return;
                    } else {
                        throw new Error(result.message || '读取文件失败');
                    }
                } catch (error) {
                    // 如果读取失败，使用默认SVG
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('LockScreen', `头像加载失败: ${avatarFileName}, 错误: ${error.message}`);
                    }
                    avatarEl.innerHTML = defaultSvg;
                }
            } else {
                // 使用默认SVG
                avatarEl.innerHTML = defaultSvg;
            }
        }
        
        /**
         * 渲染用户列表
         */
        static _renderUserList() {
            if (!LockScreen._userListContainer) {
                return;
            }
            
            // 清空列表
            LockScreen._userListContainer.innerHTML = '';
            
            // 如果有多个用户，显示列表
            if (LockScreen._userList.length <= 1) {
                return;
            }
            
            LockScreen._userList.forEach((user, index) => {
                const userItem = document.createElement('div');
                userItem.className = 'lockscreen-user-item';
                userItem.dataset.username = user.username;
                userItem.style.cssText = `
                    padding: 12px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.2s ease;
                    background: ${index === LockScreen._currentUserIndex ? 'rgba(255, 255, 255, 0.15)' : 'transparent'};
                `;
                
                // 用户头像（小）
                const avatar = document.createElement('div');
                avatar.style.cssText = `
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                `;
                
                // 默认SVG（小）
                const defaultSvgSmall = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9"/>
                        <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.9"/>
                    </svg>
                `;
                
                // 获取最新的用户数据（直接从UserControl获取）
                const userDataFromMemory = UserControl._users && UserControl._users.get ? UserControl._users.get(user.username) : null;
                const avatarFileName = userDataFromMemory && userDataFromMemory.avatar ? userDataFromMemory.avatar : (user.avatar || null);
                
                if (avatarFileName) {
                    // 异步加载头像
                    (async () => {
                        try {
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'read_file');
                            url.searchParams.set('path', 'D:/cache/');
                            url.searchParams.set('fileName', avatarFileName);
                            url.searchParams.set('asBase64', 'true');
                            
                            const response = await fetch(url.toString());
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                            
                            const result = await response.json();
                            if (result.status === 'success' && result.data && result.data.content) {
                                // 确定MIME类型
                                const fileExt = avatarFileName.split('.').pop()?.toLowerCase() || 'jpg';
                                const mimeType = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                                                fileExt === 'png' ? 'image/png' :
                                                fileExt === 'gif' ? 'image/gif' :
                                                fileExt === 'webp' ? 'image/webp' :
                                                fileExt === 'svg' ? 'image/svg+xml' :
                                                fileExt === 'bmp' ? 'image/bmp' : 'image/jpeg';
                                
                                const img = document.createElement('img');
                                img.src = `data:${mimeType};base64,${result.data.content}`;
                                img.style.cssText = `
                                    width: 100%;
                                    height: 100%;
                                    object-fit: cover;
                                    border-radius: 50%;
                                `;
                                img.onerror = () => {
                                    avatar.innerHTML = defaultSvgSmall;
                                };
                                avatar.innerHTML = '';
                                avatar.appendChild(img);
                            } else {
                                throw new Error(result.message || '读取文件失败');
                            }
                        } catch (error) {
                            avatar.innerHTML = defaultSvgSmall;
                        }
                    })();
                } else {
                    avatar.innerHTML = defaultSvgSmall;
                }
                avatar.style.color = 'rgba(255, 255, 255, 0.8)';
                userItem.appendChild(avatar);
                
                // 用户名
                const userName = document.createElement('div');
                userName.textContent = user.username;
                userName.style.cssText = `
                    flex: 1;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 14px;
                    font-weight: 400;
                `;
                userItem.appendChild(userName);
                
                // 密码图标（如果有密码）
                // 优先从内存中检查密码状态，确保显示最新的密码状态
                let userHasPassword = false;
                const userDataInMemory = UserControl._users?.get(user.username);
                if (userDataInMemory) {
                    userHasPassword = userDataInMemory.password !== null && 
                                     userDataInMemory.password !== undefined && 
                                     userDataInMemory.password !== '';
                } else {
                    // 如果内存中没有，使用listUsers返回的hasPassword字段
                    userHasPassword = user.hasPassword || false;
                }
                
                if (userHasPassword) {
                    const lockIcon = document.createElement('div');
                    lockIcon.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
                            <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="currentColor" stroke-width="2" fill="none"/>
                        </svg>
                    `;
                    lockIcon.style.cssText = `
                        width: 16px;
                        height: 16px;
                        color: rgba(255, 255, 255, 0.6);
                        flex-shrink: 0;
                    `;
                    userItem.appendChild(lockIcon);
                }
                
                // 点击切换用户
                userItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    LockScreen._switchUser(index);
                });
                
                // 悬停效果
                userItem.addEventListener('mouseenter', () => {
                    if (index !== LockScreen._currentUserIndex) {
                        userItem.style.background = 'rgba(255, 255, 255, 0.1)';
                    }
                });
                userItem.addEventListener('mouseleave', () => {
                    if (index !== LockScreen._currentUserIndex) {
                        userItem.style.background = 'transparent';
                    }
                });
                
                LockScreen._userListContainer.appendChild(userItem);
            });
        }
        
        /**
         * 切换用户
         */
        static _switchUser(userIndex) {
            if (userIndex < 0 || userIndex >= LockScreen._userList.length) {
                return;
            }
            
            LockScreen._currentUserIndex = userIndex;
            const userData = LockScreen._userList[userIndex];
            
            // 更新当前用户
            LockScreen.currentUser = userData.username;
            
            // 更新用户名显示
            const userNameEl = document.getElementById('lockscreen-username');
            if (userNameEl) {
                userNameEl.textContent = userData.username;
            }
            
            // 更新头像（异步）
            LockScreen._updateUserAvatar(userData).catch(err => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('LockScreen', `更新用户头像失败: ${err.message}`, err);
                }
            });
            
            // 更新密码模式（优先直接从内存中检查，确保获取最新的密码状态）
            let hasPassword = false;
            const userDataInMemory = UserControl._users?.get(userData.username);
            if (userDataInMemory) {
                // 直接从内存中的用户数据检查密码
                hasPassword = userDataInMemory.password !== null && 
                             userDataInMemory.password !== undefined && 
                             userDataInMemory.password !== '';
            } else {
                // 如果内存中没有，尝试使用listUsers返回的hasPassword字段
                if (userData.hasPassword !== undefined) {
                    hasPassword = userData.hasPassword;
                } else {
                    // 最后使用hasPassword方法
                    hasPassword = UserControl.hasPassword(userData.username);
                }
            }
            LockScreen.isPasswordMode = hasPassword;
            
            // 调试日志
            if (typeof KernelLogger !== 'undefined') {
                const passwordValue = userDataInMemory?.password;
                KernelLogger.debug('LockScreen', `切换用户 ${userData.username} 密码状态: ${hasPassword}, listUsers.hasPassword: ${userData.hasPassword}, 密码哈希: ${passwordValue ? passwordValue.substring(0, 8) + '...' : 'null'}`);
            }
            
            // 隐藏密码输入容器（如果已显示）
            const passwordContainer = document.getElementById('lockscreen-password-container');
            if (passwordContainer) {
                passwordContainer.style.display = 'none';
            }
            
            // 清空密码输入
            if (LockScreen.passwordInput) {
                LockScreen.passwordInput.value = '';
            }
            
            // 显示提示文字
            const hintText = document.getElementById('lockscreen-hint');
            if (hintText) {
                hintText.textContent = '按任意键继续';
                hintText.style.display = 'block';
            }
            
            // 更新用户列表高亮
            LockScreen._renderUserList();
            
            // 隐藏用户列表
            LockScreen._hideUserList();
        }
        
        /**
         * 切换用户列表显示/隐藏
         */
        static _toggleUserList() {
            if (LockScreen._showUserList) {
                LockScreen._hideUserList();
            } else {
                LockScreen._displayUserList();
            }
        }
        
        /**
         * 显示用户列表
         */
        static _displayUserList() {
            if (!LockScreen._userListContainer || LockScreen._userList.length <= 1) {
                return;
            }
            
            LockScreen._showUserList = true;
            LockScreen._userListContainer.style.display = 'flex';
            
            // 添加动画
            requestAnimationFrame(() => {
                LockScreen._userListContainer.style.opacity = '0';
                LockScreen._userListContainer.style.transform = 'translateX(-50%) translateY(-10px)';
                LockScreen._userListContainer.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                
                requestAnimationFrame(() => {
                    LockScreen._userListContainer.style.opacity = '1';
                    LockScreen._userListContainer.style.transform = 'translateX(-50%) translateY(0)';
                });
            });
        }
        
        /**
         * 隐藏用户列表
         */
        static _hideUserList() {
            if (!LockScreen._userListContainer) {
                return;
            }
            
            LockScreen._showUserList = false;
            
            // 添加淡出动画
            LockScreen._userListContainer.style.opacity = '0';
            LockScreen._userListContainer.style.transform = 'translateX(-50%) translateY(-10px)';
            LockScreen._userListContainer.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            
            setTimeout(() => {
                if (LockScreen._userListContainer) {
                    LockScreen._userListContainer.style.display = 'none';
                }
            }, 300);
        }
        
        /**
         * 显示密码输入界面
         */
        static _showPasswordInput() {
            const passwordContainer = document.getElementById('lockscreen-password-container');
            const hintText = document.getElementById('lockscreen-hint');
            
            if (!passwordContainer) {
                return;
            }
            
            // 在显示密码输入前，重新检查当前用户的密码状态
            // 这确保我们获取最新的密码状态（例如，如果用户在设置程序中刚刚设置了密码）
            if (LockScreen.currentUser && typeof UserControl !== 'undefined') {
                const userData = UserControl._users?.get(LockScreen.currentUser);
                if (userData) {
                    const hasPassword = userData.password !== null && 
                                       userData.password !== undefined && 
                                       userData.password !== '';
                    LockScreen.isPasswordMode = hasPassword;
                    
                    // 调试日志
                    if (typeof KernelLogger !== 'undefined') {
                        const passwordValue = userData.password;
                        KernelLogger.debug('LockScreen', `重新检查密码状态: 用户 ${LockScreen.currentUser}, 有密码: ${hasPassword}, 密码哈希: ${passwordValue ? passwordValue.substring(0, 8) + '...' : 'null'}`);
                    }
                }
            }
            
            // 显示加载蒙版
            LockScreen._showLoadingOverlay('正在加载...');
            
            // 延迟显示，让用户看到加载状态
            setTimeout(() => {
                if (LockScreen.isPasswordMode) {
                    // 有密码，显示密码输入框
                    passwordContainer.style.display = 'flex';
                    if (LockScreen.passwordInput) {
                        LockScreen.passwordInput.style.display = 'block';
                    }
                    if (LockScreen.loginButton) {
                        LockScreen.loginButton.style.display = 'flex';
                    }
                    setTimeout(() => {
                        if (LockScreen.passwordInput) {
                            LockScreen.passwordInput.focus();
                        }
                        // 隐藏加载蒙版
                        LockScreen._hideLoadingOverlay();
                    }, 200);
                    if (hintText) {
                        hintText.style.display = 'none';
                    }
                } else {
                    // 无密码，显示登录按钮
                    passwordContainer.style.display = 'flex';
                    if (LockScreen.loginButton) {
                        LockScreen.loginButton.style.display = 'flex';
                    }
                    if (LockScreen.passwordInput) {
                        LockScreen.passwordInput.style.display = 'none';
                    }
                    if (hintText) {
                        hintText.textContent = '按回车键登录';
                    }
                    // 隐藏加载蒙版
                    setTimeout(() => {
                        LockScreen._hideLoadingOverlay();
                    }, 200);
                }
            }, 300);
        }
        
        /**
         * 显示加载蒙版
         * @param {string} message 加载提示信息
         */
        static _showLoadingOverlay(message = '正在验证...') {
            if (LockScreen._isLoading || !LockScreen.container) {
                return;
            }
            
            LockScreen._isLoading = true;
            
            // 创建加载蒙版
            const overlay = document.createElement('div');
            overlay.className = 'lockscreen-loading-overlay';
            overlay.id = 'lockscreen-loading-overlay';
            
            // 创建加载内容
            const loadingContent = document.createElement('div');
            loadingContent.className = 'lockscreen-loading-content';
            
            // 创建加载动画（旋转圆圈）
            const spinner = document.createElement('div');
            spinner.className = 'lockscreen-loading-spinner';
            spinner.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3" 
                            stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416" 
                            opacity="0.3"/>
                    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3" 
                            stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="23.562">
                        <animate attributeName="stroke-dashoffset" dur="1.4s" repeatCount="indefinite" 
                                 values="31.416;0;31.416"/>
                        <animateTransform attributeName="transform" type="rotate" dur="1.4s" 
                                          repeatCount="indefinite" values="0 24 24;360 24 24"/>
                    </circle>
                </svg>
            `;
            
            // 创建加载文本
            const loadingText = document.createElement('div');
            loadingText.className = 'lockscreen-loading-text';
            loadingText.textContent = message;
            
            loadingContent.appendChild(spinner);
            loadingContent.appendChild(loadingText);
            overlay.appendChild(loadingContent);
            
            LockScreen.container.appendChild(overlay);
            LockScreen._loadingOverlay = overlay;
            
            // 触发动画
            requestAnimationFrame(() => {
                overlay.classList.add('lockscreen-loading-overlay-visible');
            });
        }
        
        /**
         * 隐藏加载蒙版
         */
        static _hideLoadingOverlay() {
            if (!LockScreen._isLoading || !LockScreen._loadingOverlay) {
                return;
            }
            
            const overlay = LockScreen._loadingOverlay;
            overlay.classList.remove('lockscreen-loading-overlay-visible');
            overlay.classList.add('lockscreen-loading-overlay-hidden');
            
            setTimeout(() => {
                if (overlay && overlay.parentElement) {
                    overlay.parentElement.removeChild(overlay);
                }
                LockScreen._loadingOverlay = null;
                LockScreen._isLoading = false;
            }, 300);
        }
        
        /**
         * 处理登录
         */
        static async _handleLogin(password = null) {
            if (!LockScreen.currentUser) {
                return;
            }
            
            // 显示加载蒙版
            const loadingMessage = LockScreen.isPasswordMode ? '正在验证密码...' : '正在登录...';
            LockScreen._showLoadingOverlay(loadingMessage);
            
            try {
                // 模拟一个小的延迟，让用户看到加载状态
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const success = await UserControl.login(LockScreen.currentUser, password);
                
                // 隐藏加载蒙版
                LockScreen._hideLoadingOverlay();
                
                if (success) {
                    // 登录成功，显示成功消息
                    LockScreen._showLoadingOverlay('登录成功，正在进入系统...');
                    
                    // 延迟一下再隐藏锁屏界面，让用户看到成功消息
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 更新开始菜单的用户信息
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._updateStartMenuUserInfo === 'function') {
                        TaskbarManager._updateStartMenuUserInfo().catch(err => {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('LockScreen', `更新开始菜单用户信息失败: ${err.message}`);
                            }
                        });
                    }
                    
                    LockScreen._hideLoadingOverlay();
                    // 隐藏锁屏界面
                    LockScreen._hideLockScreen();
                } else {
                    // 登录失败
                    if (LockScreen.passwordInput) {
                        LockScreen.passwordInput.value = '';
                        LockScreen.passwordInput.focus();
                        // 添加错误动画
                        LockScreen.passwordInput.classList.add('error');
                        setTimeout(() => {
                            LockScreen.passwordInput.classList.remove('error');
                        }, 500);
                    }
                }
            } catch (e) {
                // 隐藏加载蒙版
                LockScreen._hideLoadingOverlay();
                KernelLogger.error('LockScreen', `登录失败: ${e.message}`, e);
                
                // 显示错误提示
                if (LockScreen.passwordInput) {
                    LockScreen.passwordInput.value = '';
                    LockScreen.passwordInput.focus();
                    LockScreen.passwordInput.classList.add('error');
                    setTimeout(() => {
                        LockScreen.passwordInput.classList.remove('error');
                    }, 500);
                }
            }
        }
        
        /**
         * 隐藏锁屏界面
         */
        static _hideLockScreen() {
            if (LockScreen.container) {
                LockScreen.container.classList.add('lockscreen-fade-out');
                setTimeout(() => {
                    if (LockScreen.container && LockScreen.container.parentElement) {
                        LockScreen.container.parentElement.removeChild(LockScreen.container);
                    }
                    
                    // 显示系统内容（桌面）
                    const kernelContent = document.getElementById('kernel-content');
                    if (kernelContent) {
                        kernelContent.style.display = 'flex';
                        kernelContent.style.opacity = '0';
                        kernelContent.style.transition = 'opacity 0.5s ease-in';
                        // 触发重排以应用transition
                        void kernelContent.offsetWidth;
                        kernelContent.style.opacity = '1';
                    }
                    
                    // 初始化任务栏（如果 TaskbarManager 已加载）
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.init === 'function') {
                        try {
                            // 延迟初始化，确保所有程序都已启动
                            setTimeout(() => {
                                TaskbarManager.init();
                            }, 500);
                        } catch (e) {
                            KernelLogger.warn("LockScreen", `任务栏初始化失败: ${e.message}`);
                        }
                    }
                    
                    // 初始化通知管理器（如果 NotificationManager 已加载）
                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.init === 'function') {
                        try {
                            // 延迟初始化，确保任务栏已初始化（通知管理器依赖任务栏位置）
                            setTimeout(() => {
                                NotificationManager.init().then(() => {
                                    KernelLogger.info("LockScreen", "通知管理器初始化完成");
                                }).catch(e => {
                                    KernelLogger.warn("LockScreen", `通知管理器初始化失败: ${e.message}`);
                                });
                            }, 1000);
                        } catch (e) {
                            KernelLogger.warn("LockScreen", `通知管理器初始化失败: ${e.message}`);
                        }
                    }
                    
                    KernelLogger.info('LockScreen', '锁屏界面已隐藏，系统已解锁');
                }, 500);
            }
        }
        
        /**
         * 设置键盘监听
         */
        static _setupKeyboardListeners() {
            let keyPressed = false;
            
            document.addEventListener('keydown', (e) => {
                // 如果已经在密码模式，处理密码输入
                if (LockScreen.isPasswordMode && LockScreen.passwordInput && LockScreen.passwordInput.style.display !== 'none') {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const password = LockScreen.passwordInput.value;
                        LockScreen._handleLogin(password);
                    }
                    return;
                }
                
                // 如果无密码模式，按回车登录
                if (!LockScreen.isPasswordMode && e.key === 'Enter') {
                    e.preventDefault();
                    LockScreen._handleLogin();
                    return;
                }
                
                // 首次按键，显示登录界面
                if (!keyPressed && !LockScreen.isPasswordMode) {
                    keyPressed = true;
                    LockScreen._showPasswordInput();
                } else if (!keyPressed && LockScreen.isPasswordMode) {
                    keyPressed = true;
                    LockScreen._showPasswordInput();
                }
            }, { once: false });
            
            // 点击屏幕也可以触发
            LockScreen.container.addEventListener('click', (e) => {
                // 如果点击的是登录按钮、用户切换按钮或用户列表，不触发
                if (e.target.closest('.lockscreen-login-button') || 
                    e.target.closest('.lockscreen-user-switch') ||
                    e.target.closest('.lockscreen-user-list')) {
                    return;
                }
                
                // 点击其他地方时隐藏用户列表
                if (LockScreen._showUserList) {
                    LockScreen._hideUserList();
                }
                
                if (!keyPressed) {
                    keyPressed = true;
                    LockScreen._showPasswordInput();
                }
            }, { once: false });
            
            // 登录按钮点击事件
            if (LockScreen.loginButton) {
                LockScreen.loginButton.addEventListener('click', () => {
                    if (LockScreen.isPasswordMode) {
                        const password = LockScreen.passwordInput ? LockScreen.passwordInput.value : null;
                        LockScreen._handleLogin(password);
                    } else {
                        LockScreen._handleLogin();
                    }
                });
            }
        }
        
        /**
         * 检查内核加载状态并初始化锁屏（降级方案，如果 BootLoader 未调用 init）
         */
        static checkAndInit() {
            // 检查内核是否已加载完成
            const kernelContent = document.getElementById('kernel-content');
            const kernelLoading = document.getElementById('kernel-loading');
            
            // 如果加载界面已隐藏（display: none 或 opacity: 0），说明内核已加载完成
            if (kernelLoading && 
                (kernelLoading.style.display === 'none' || 
                 kernelLoading.style.opacity === '0' ||
                 getComputedStyle(kernelLoading).display === 'none' ||
                 getComputedStyle(kernelLoading).opacity === '0')) {
                
                // 内核加载完成，先隐藏桌面内容（如果已显示），然后显示锁屏
                if (kernelContent) {
                    kernelContent.style.display = 'none';
                }
                
                // 检查是否已经初始化过锁屏
                if (document.getElementById('lockscreen')) {
                    return true; // 已经初始化
                }
                
                // 停止检查
                if (LockScreen._checkInterval) {
                    clearInterval(LockScreen._checkInterval);
                    LockScreen._checkInterval = null;
                }
                
                setTimeout(() => {
                    LockScreen.init();
                }, 500);
                return true;
            }
            return false;
        }
        
        /**
         * 开始检查内核加载状态（降级方案，如果 BootLoader 未调用 init）
         */
        static startChecking() {
            if (LockScreen._checkInterval) {
                return; // 已经在检查
            }
            
            LockScreen._checkInterval = setInterval(() => {
                if (LockScreen.checkAndInit()) {
                    clearInterval(LockScreen._checkInterval);
                    LockScreen._checkInterval = null;
                }
            }, 100);
        }
    }
    
    // 注册到 POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "LockScreen", LockScreen);
        } catch (e) {
            KernelLogger.error("LockScreen", `注册到 POOL 失败: ${e.message}`);
        }
    }
    
    // 发布信号
    if (typeof DependencyConfig !== 'undefined') {
        DependencyConfig.publishSignal("../system/ui/lockscreen.js");
    } else {
        const publishWhenReady = () => {
            if (typeof DependencyConfig !== 'undefined') {
                DependencyConfig.publishSignal("../system/ui/lockscreen.js");
            } else {
                setTimeout(publishWhenReady, 10);
            }
        };
        publishWhenReady();
    }
    
    // 监听内核引导完成事件（主要方式）
    if (typeof document !== 'undefined' && document.body) {
        document.body.addEventListener('kernelBootComplete', () => {
            // BootLoader 应该已经调用了 LockScreen.init()，这里只作为降级方案
            if (!LockScreen._initialized && !document.getElementById('lockscreen')) {
                KernelLogger.debug("LockScreen", "通过 kernelBootComplete 事件初始化锁屏界面（降级方案）");
                setTimeout(() => {
                    LockScreen.init();
                }, 300);
            }
        }, { once: true });
    }
    
    // 自动开始检查内核加载状态（降级方案，如果事件未触发）
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // 延迟启动检查，给 BootLoader 时间调用 init
                setTimeout(() => {
                    if (!LockScreen._initialized) {
                        LockScreen.startChecking();
                    }
                }, 2000);
            });
        } else {
            // 延迟启动检查，给 BootLoader 时间调用 init
            setTimeout(() => {
                if (!LockScreen._initialized) {
                    LockScreen.startChecking();
                }
            }, 2000);
        }
    }
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.LockScreen = LockScreen;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.LockScreen = LockScreen;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

