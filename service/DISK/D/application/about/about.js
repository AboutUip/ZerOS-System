// ZerOS 系统信息
// 显示 ZerOS 系统版本、内核版本、宿主环境信息和开发者信息
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const ABOUT = {
        pid: null,
        window: null,
        
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
            this.window.className = 'about-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 800px;
                height: 700px;
                min-width: 600px;
                min-height: 500px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('about');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '关于 ZerOS',
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
        
        _initMemory: function(pid) {
            if (typeof MemoryManager !== 'undefined') {
                try {
                    // 使用 MemoryUtils.getAppMemory 获取内存，如果不可用则直接从 APPLICATION_SOP 获取
                    if (typeof MemoryUtils !== 'undefined' && typeof MemoryUtils.getAppMemory === 'function') {
                        const memory = MemoryUtils.getAppMemory(pid);
                        if (memory) {
                            this._heap = memory.heap;
                            this._shed = memory.shed;
                        }
                    } else {
                        // 降级方案：直接从 APPLICATION_SOP 获取
                        const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                        if (appSpace) {
                            this._heap = appSpace.heaps.get(1) || null;
                            this._shed = appSpace.sheds.get(1) || null;
                        }
                    }
                } catch (e) {
                    console.warn('[About] 内存初始化失败:', e);
                }
            }
        },
        
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'about-content';
            content.style.cssText = `
                width: 100%;
                height: 100%;
                overflow-y: auto;
                padding: 40px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 30px;
            `;
            
            // Logo 区域
            const logoSection = this._createLogoSection();
            content.appendChild(logoSection);
            
            // 系统信息区域
            const systemInfoSection = this._createSystemInfoSection();
            content.appendChild(systemInfoSection);
            
            // 开发者信息区域
            const developerSection = this._createDeveloperSection();
            content.appendChild(developerSection);
            
            // 宿主环境信息区域
            const hostInfoSection = this._createHostInfoSection();
            content.appendChild(hostInfoSection);
            
            return content;
        },
        
        _createLogoSection: function() {
            const logoSection = document.createElement('div');
            logoSection.className = 'about-logo-section';
            logoSection.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
                margin-bottom: 20px;
            `;
            
            // Logo 图片
            const logoImg = document.createElement('img');
            // 从 SystemInformation 获取 Logo 路径
            // SystemInformation 返回的路径是相对于 test/index.html 的
            const logoPath = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getLogoPath() 
                : 'zeros-logo.svg';
            logoImg.src = logoPath;
            logoImg.alt = 'ZerOS Logo';
            // 添加错误处理
            logoImg.onerror = () => {
                KernelLogger.warn("About", `Logo 加载失败: ${logoPath}`);
                // 尝试备用路径
                logoImg.src = '../zeros-logo.svg';
            };
            logoImg.style.cssText = `
                width: 150px;
                height: 150px;
                object-fit: contain;
                filter: drop-shadow(0 8px 16px rgba(139, 92, 246, 0.3));
            `;
            logoSection.appendChild(logoImg);
            
            // 系统名称
            const systemName = document.createElement('h1');
            const sysName = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getSystemName() 
                : 'ZerOS';
            systemName.textContent = sysName;
            systemName.style.cssText = `
                font-size: 48px;
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
                : '基于浏览器实现的虚拟操作系统内核';
            description.textContent = sysDesc;
            description.style.cssText = `
                font-size: 16px;
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
            title.textContent = '系统信息';
            title.style.cssText = `
                font-size: 20px;
                font-weight: 600;
                margin: 0 0 20px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 12px;
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
            infoList.appendChild(this._createInfoItem('系统版本', systemVersion));
            
            // 内核版本
            const kernelVersion = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getKernelVersion() 
                : '1.0.0';
            infoList.appendChild(this._createInfoItem('内核版本', kernelVersion));
            
            // 内核构建日期
            const buildDate = typeof SystemInformation !== 'undefined' 
                ? SystemInformation.getBuildDate() 
                : new Date().toLocaleDateString('zh-CN');
            infoList.appendChild(this._createInfoItem('构建日期', buildDate));
            
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
            title.textContent = '开发团队';
            title.style.cssText = `
                font-size: 20px;
                font-weight: 600;
                margin: 0 0 20px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 12px;
            `;
            section.appendChild(title);
            
            const developerList = document.createElement('div');
            developerList.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 16px;
            `;
            
            // 从 SystemInformation 获取开发者信息
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
                developerList.appendChild(devItem);
            });
            
            section.appendChild(developerList);
            
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
            title.textContent = '宿主环境';
            title.style.cssText = `
                font-size: 20px;
                font-weight: 600;
                margin: 0 0 20px 0;
                color: var(--theme-text, #d7e0dd);
                border-bottom: 2px solid var(--theme-primary, rgba(108, 142, 255, 0.3));
                padding-bottom: 12px;
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
            
            infoList.appendChild(this._createInfoItem('浏览器', hostEnv.browser));
            infoList.appendChild(this._createInfoItem('浏览器版本', hostEnv.browserVersion));
            infoList.appendChild(this._createInfoItem('用户代理', hostEnv.userAgent));
            infoList.appendChild(this._createInfoItem('平台', hostEnv.platform));
            infoList.appendChild(this._createInfoItem('语言', hostEnv.language));
            infoList.appendChild(this._createInfoItem('屏幕分辨率', `${hostEnv.screenWidth}x${hostEnv.screenHeight}`));
            infoList.appendChild(this._createInfoItem('视口大小', `${hostEnv.viewportWidth}x${hostEnv.viewportHeight}`));
            
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
            item.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 16px;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.15));
                border-radius: 8px;
            `;
            
            const orgEl = document.createElement('div');
            orgEl.textContent = organization;
            orgEl.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: var(--theme-primary, #6c8eff);
            `;
            
            const roleEl = document.createElement('div');
            roleEl.textContent = role;
            roleEl.style.cssText = `
                font-size: 13px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
            `;
            
            const nameEl = document.createElement('div');
            nameEl.textContent = name;
            nameEl.style.cssText = `
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                margin-top: 4px;
            `;
            
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
                name: '关于ZerOS',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 系统信息 - 显示系统版本、内核版本、宿主环境信息和开发者信息',
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
            // 清理资源
            if (this.window && this.window.parentElement) {
                this.window.remove();
            }
            
            // 清理内存
            if (this._heap) {
                try {
                    this._heap.clear();
                } catch (e) {
                    console.warn('[About] 清理堆内存失败:', e);
                }
            }
            
            if (this._shed) {
                try {
                    this._shed.clear();
                } catch (e) {
                    console.warn('[About] 清理栈内存失败:', e);
                }
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

