// ZerOS 系统信息
// 显示 ZerOS 系统版本、内核版本、宿主环境信息和开发者信息
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const ABOUT = {
        pid: null,
        window: null,
        /** 内存由内核在进程启动时分配、退出时释放，本程序不直接访问 MemoryManager/APPLICATION_SOP */

        /**
         * 多语言文案：优先使用 LanguagesExpansion，否则返回 fallback
         * @param {string} key 语言包常量名
         * @param {string} fallback 无语言包时的回退文案
         * @returns {string}
         */
        _getText: function(key, fallback) {
            if (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.getText === 'function') {
                const value = LanguagesExpansion.getText(key);
                if (value && value !== key) return value;
            }
            return fallback || key;
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;

            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'about-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 800px;
                height: 700px;
                min-width: 600px;
                min-height: 500px;
                max-width: 100%;
                box-sizing: border-box;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('about');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('ABOUT_TITLE', '关于 ZerOS'),
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    },
                    onMinimize: () => {
                        // 最小化回调
                    },
                    onMaximize: (isMaximized) => {
                        // 最大化回调
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
        
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'about-content';
            content.style.cssText = `
                width: 100%;
                min-width: 0;
                height: 100%;
                overflow-y: auto;
                padding: 24px 32px 40px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 24px;
            `;
            
            // 顶部：Logo + 名称 + 描述
            const logoSection = this._createLogoSection();
            content.appendChild(logoSection);
            
            // 主区域：两列布局（左：系统信息+宿主环境，右：开发团队 + 赞助商 + 合作）
            const mainRow = document.createElement('div');
            mainRow.className = 'about-main-row';
            mainRow.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1.4fr;
                gap: 24px;
                align-items: start;
            `;
            const leftCol = document.createElement('div');
            leftCol.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';
            leftCol.appendChild(this._createSystemInfoSection());
            leftCol.appendChild(this._createHostInfoSection());
            mainRow.appendChild(leftCol);
            const rightCol = document.createElement('div');
            rightCol.className = 'about-right-col';
            rightCol.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';
            rightCol.appendChild(this._createDeveloperSection());
            rightCol.appendChild(this._createSponsorsSection());
            rightCol.appendChild(this._createPartnersSection());
            mainRow.appendChild(rightCol);
            content.appendChild(mainRow);
            
            return content;
        },
        
        _createLogoSection: function() {
            const logoSection = document.createElement('div');
            logoSection.className = 'about-logo-section';
            logoSection.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            `;
            
            // Logo 图片
            const logoImg = document.createElement('img');
            // 从 SystemInformation 获取 Logo 路径
            // SystemInformation 返回的路径是相对于 test/index.html 的
            const logoPath = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getLogoPath() 
                : 'zeros-logo.svg';
            logoImg.src = logoPath;
            logoImg.alt = this._getText('ABOUT_LOGO_ALT', 'ZerOS Logo');
            // 添加错误处理
            logoImg.onerror = () => {
                KernelLogger.warn("About", `Logo 加载失败: ${logoPath}`);
                // 尝试备用路径
                logoImg.src = '../zeros-logo.svg';
            };
            logoImg.style.cssText = `
                width: 100px;
                height: 100px;
                object-fit: contain;
                filter: drop-shadow(0 6px 12px rgba(139, 92, 246, 0.3));
            `;
            logoSection.appendChild(logoImg);
            
            // 系统名称
            const systemName = document.createElement('h1');
            const sysName = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getSystemName() 
                : 'ZerOS';
            systemName.textContent = sysName;
            systemName.style.cssText = `
                font-size: 36px;
                font-weight: 700;
                margin: 0;
                background: linear-gradient(135deg, #8b5cf6 0%, #6c8eff 50%, #8da6ff 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-align: center;
            `;
            logoSection.appendChild(systemName);
            
            // 系统描述
            const description = document.createElement('p');
            const sysDesc = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getSystemDescription() 
                : this._getText('ABOUT_SYS_DESC', '基于浏览器实现的虚拟操作系统内核');
            description.textContent = sysDesc;
            description.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.7));
                margin: 0;
                text-align: center;
            `;
            logoSection.appendChild(description);
            
            return logoSection;
        },
        
        _createSystemInfoSection: function() {
            const section = document.createElement('div');
            section.className = 'about-system-info';
            section.style.cssText = `
                width: 100%;
                background: var(--theme-background-elevated, rgba(26, 31, 46, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 12px;
                padding: 24px;
                box-sizing: border-box;
            `;
            
            const title = document.createElement('h2');
            title.textContent = this._getText('ABOUT_SYSTEM_INFO', '系统信息');
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 14px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 8px;
            `;
            section.appendChild(title);
            
            const infoList = document.createElement('div');
            infoList.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 16px;
            `;
            
            // 系统版本
            const systemVersion = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getSystemVersion() 
                : '1.0.0';
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_SYSTEM_VERSION', '系统版本'), systemVersion));
            
            // 内核版本
            const kernelVersion = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getKernelVersion() 
                : '1.0.0';
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_KERNEL_VERSION', '内核版本'), kernelVersion));
            
            // 内核构建日期
            const buildDate = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getBuildDate() 
                : new Date().toLocaleDateString('zh-CN');
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_BUILD_DATE', '构建日期'), buildDate));
            
            section.appendChild(infoList);
            
            return section;
        },
        
        _createDeveloperSection: function() {
            const section = document.createElement('div');
            section.className = 'about-developer';
            section.style.cssText = `
                width: 100%;
                background: var(--theme-background-elevated, rgba(26, 31, 46, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 12px;
                padding: 24px;
                box-sizing: border-box;
            `;
            
            const title = document.createElement('h2');
            title.textContent = this._getText('ABOUT_DEVELOPER_TEAM', '开发团队');
            title.style.cssText = `
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 16px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 10px;
            `;
            section.appendChild(title);
            
            // 使用网格布局，适配开发者数量增多
            const developerGrid = document.createElement('div');
            developerGrid.className = 'about-developer-grid';
            developerGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
            `;
            
            const developers = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getDevelopers() 
                : [
                    { organization: 'KitePromiss 工作室', role: '全栈开发者', name: '萱崽Aa' },
                    { organization: '个人开发者', role: '内核开发', name: '默默' }
                ];
            
            developers.forEach(dev => {
                const devItem = this._createDeveloperItem(
                    dev.organization,
                    dev.role,
                    dev.name
                );
                developerGrid.appendChild(devItem);
            });
            
            section.appendChild(developerGrid);
            
            return section;
        },
        
        _createSponsorsSection: function() {
            const section = document.createElement('div');
            section.className = 'about-sponsors';
            section.style.cssText = `
                width: 100%;
                background: var(--theme-background-elevated, rgba(26, 31, 46, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 12px;
                padding: 24px;
                box-sizing: border-box;
            `;
            
            const title = document.createElement('h2');
            title.textContent = this._getText('ABOUT_SPONSORS', '赞助商');
            title.style.cssText = `
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 8px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 10px;
            `;
            section.appendChild(title);
            
            const desc = document.createElement('p');
            desc.textContent = this._getText('ABOUT_SPONSORS_DESC', '感谢以下赞助商对 ZerOS 的支持');
            desc.style.cssText = `font-size: 13px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6)); margin: 0 0 16px 0;`;
            section.appendChild(desc);
            
            const sponsors = typeof SystemInformation !== 'undefined' ? SystemInformation.getSponsors() : [];
            const list = document.createElement('div');
            list.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            if (sponsors.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = this._getText('ABOUT_NO_SPONSORS', '暂无赞助商');
                empty.style.cssText = `font-size: 14px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.5)); margin: 0;`;
                list.appendChild(empty);
            } else {
                sponsors.forEach(s => {
                    const bar = document.createElement('div');
                    bar.style.cssText = `
                        display: flex; flex-direction: column; align-items: stretch;
                        padding: 12px 16px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.15));
                        border-radius: 8px;
                        width: 100%;
                        box-sizing: border-box;
                        gap: 6px;
                    `;
                    const nameEl = document.createElement(s.link ? 'a' : 'span');
                    nameEl.textContent = s.name;
                    if (s.link) {
                        nameEl.href = s.link;
                        nameEl.target = '_blank';
                        nameEl.rel = 'noopener';
                        nameEl.style.color = 'var(--theme-primary, #6c8eff)';
                    }
                    nameEl.style.cssText = (nameEl.style.cssText || '') + ' font-size: 14px; font-weight: 600;';
                    bar.appendChild(nameEl);
                    if (s.description) {
                        const d = document.createElement('div');
                        d.textContent = s.description;
                        d.style.cssText = 'font-size: 13px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6)); margin: 0; line-height: 1.4;';
                        bar.appendChild(d);
                    }
                    list.appendChild(bar);
                });
            }
            section.appendChild(list);
            return section;
        },
        
        _createPartnersSection: function() {
            const section = document.createElement('div');
            section.className = 'about-partners';
            section.style.cssText = `
                width: 100%;
                background: var(--theme-background-elevated, rgba(26, 31, 46, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 12px;
                padding: 24px;
                box-sizing: border-box;
            `;
            
            const title = document.createElement('h2');
            title.textContent = this._getText('ABOUT_PARTNERS', '合作');
            title.style.cssText = `
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 8px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 10px;
            `;
            section.appendChild(title);
            
            const desc = document.createElement('p');
            desc.textContent = this._getText('ABOUT_PARTNERS_DESC', '感谢以下合作伙伴与 ZerOS 的协作');
            desc.style.cssText = `font-size: 13px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6)); margin: 0 0 16px 0;`;
            section.appendChild(desc);
            
            const partners = typeof SystemInformation !== 'undefined' ? SystemInformation.getPartners() : [];
            const grid = document.createElement('div');
            grid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;`;
            
            if (partners.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = this._getText('ABOUT_NO_PARTNERS', '暂无合作方');
                empty.style.cssText = `font-size: 14px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.5)); margin: 0;`;
                grid.appendChild(empty);
            } else {
                partners.forEach(p => {
                    const card = document.createElement('div');
                    card.style.cssText = `
                        padding: 14px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.15));
                        border-radius: 8px;
                    `;
                    const nameEl = document.createElement(p.link ? 'a' : 'div');
                    nameEl.textContent = p.name;
                    if (p.link) {
                        nameEl.href = p.link;
                        nameEl.target = '_blank';
                        nameEl.rel = 'noopener';
                        nameEl.style.color = 'var(--theme-primary, #6c8eff)';
                    }
                    nameEl.style.cssText = (nameEl.style.cssText || '') + ' font-size: 14px; font-weight: 600; display: block; margin-bottom: 4px;';
                    card.appendChild(nameEl);
                    if (p.description) {
                        const d = document.createElement('div');
                        d.textContent = p.description;
                        d.style.cssText = 'font-size: 12px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));';
                        card.appendChild(d);
                    }
                    grid.appendChild(card);
                });
            }
            section.appendChild(grid);
            return section;
        },
        
        _createHostInfoSection: function() {
            const section = document.createElement('div');
            section.className = 'about-host-info';
            section.style.cssText = `
                width: 100%;
                background: var(--theme-background-elevated, rgba(26, 31, 46, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 12px;
                padding: 24px;
                box-sizing: border-box;
            `;
            
            const title = document.createElement('h2');
            title.textContent = this._getText('ABOUT_HOST_ENV', '宿主环境');
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 14px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 8px;
            `;
            section.appendChild(title);
            
            const infoList = document.createElement('div');
            infoList.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 16px;
            `;
            
            // 从 SystemInformation 获取宿主环境信息
            const hostEnv = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getHostEnvironment() 
                : this._getHostEnvironmentFallback();
            
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_BROWSER', '浏览器'), hostEnv.browser));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_BROWSER_VERSION', '浏览器版本'), hostEnv.browserVersion));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_USER_AGENT', '用户代理'), hostEnv.userAgent));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_PLATFORM', '平台'), hostEnv.platform));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_LANGUAGE', '语言'), hostEnv.language));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_SCREEN_RESOLUTION', '屏幕分辨率'), `${hostEnv.screenWidth}x${hostEnv.screenHeight}`));
            infoList.appendChild(this._createInfoItem(this._getText('ABOUT_VIEWPORT_SIZE', '视口大小'), `${hostEnv.viewportWidth}x${hostEnv.viewportHeight}`));
            
            section.appendChild(infoList);
            
            return section;
        },
        
        _createInfoItem: function(label, value) {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid var(--theme-border, rgba(108, 142, 255, 0.1));
            `;
            
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelEl.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.7));
                font-weight: 500;
            `;
            
            const valueEl = document.createElement('span');
            valueEl.textContent = value;
            valueEl.style.cssText = `
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                font-weight: 400;
                text-align: right;
                max-width: 60%;
                word-break: break-word;
            `;
            
            item.appendChild(labelEl);
            item.appendChild(valueEl);
            
            return item;
        },
        
        _createDeveloperItem: function(organization, role, name) {
            const item = document.createElement('div');
            item.className = 'about-developer-card';
            item.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 12px 14px;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.15));
                border-radius: 8px;
            `;
            
            const orgEl = document.createElement('div');
            orgEl.textContent = organization;
            orgEl.style.cssText = `font-size: 14px; font-weight: 600; color: var(--theme-primary, #6c8eff);`;
            
            const roleEl = document.createElement('div');
            roleEl.textContent = role;
            roleEl.style.cssText = `font-size: 12px; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));`;
            
            const nameEl = document.createElement('div');
            nameEl.textContent = name;
            nameEl.style.cssText = `font-size: 13px; color: var(--theme-text, #d7e0dd);`;
            
            item.appendChild(orgEl);
            item.appendChild(roleEl);
            item.appendChild(nameEl);
            
            return item;
        },
        
        _getHostEnvironmentFallback: function() {
            // 降级方案：如果 SystemInformation 不可用，使用本地方法
            const browserInfo = this._getBrowserInfo();
            return {
                browser: browserInfo.name,
                browserVersion: browserInfo.version,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '未知',
                platform: typeof navigator !== 'undefined' ? navigator.platform : '未知',
                language: typeof navigator !== 'undefined' ? navigator.language : '未知',
                screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
                screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
                viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
                viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0
            };
        },
        
        _getBrowserInfo: function() {
            if (typeof navigator === 'undefined') {
                return { name: '未知', version: '未知' };
            }
            
            const ua = navigator.userAgent;
            let browserName = '未知';
            let browserVersion = '未知';
            
            if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
                browserName = 'Chrome';
                const match = ua.match(/Chrome\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (ua.indexOf('Firefox') > -1) {
                browserName = 'Firefox';
                const match = ua.match(/Firefox\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
                browserName = 'Safari';
                const match = ua.match(/Version\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (ua.indexOf('Edg') > -1) {
                browserName = 'Edge';
                const match = ua.match(/Edg\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
                browserName = 'Opera';
                const match = ua.match(/(?:Opera|OPR)\/(\d+)/);
                if (match) browserVersion = match[1];
            }
            
            return { name: browserName, version: browserVersion };
        },
        
        __info__: function() {
            return {
                name: this._getText('ABOUT_NAME', '关于ZerOS'),
                type: 'GUI',
                version: '1.0.0',
                description: this._getText('ABOUT_DESCRIPTION', 'ZerOS 系统信息 - 显示系统版本、内核版本、宿主环境信息和开发者信息'),
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    category: 'system',
                    showOnDesktop: true
                }
            };
        },
        
        __exit__: function() {
            // 清理窗口；进程内存由内核在进程退出时统一释放（MemoryManager.freeMemory），本程序不直接操作堆/栈
            if (this.window && this.window.parentElement) {
                this.window.remove();
            }
        }
    };
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.ABOUT = ABOUT;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ABOUT = ABOUT;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

