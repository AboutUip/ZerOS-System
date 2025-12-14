// ZerOS WebViewer
// 提供静态网页容器功能，允许用户选择文件夹并运行其中的index.html
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const WEBVIEWER = {
        pid: null,
        window: null,
        iframe: null,
        currentFolder: null,
        currentIndexHtml: null,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'webviewer-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 如果 GUIManager 不可用，设置完整样式
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 1000px;
                    height: 700px;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(180deg, rgba(26, 31, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%);
                    border: 1px solid rgba(108, 142, 255, 0.3);
                    border-radius: 12px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(30px) saturate(180%);
                    -webkit-backdrop-filter: blur(30px) saturate(180%);
                    overflow: hidden;
                `;
            } else {
                this.window.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
            }
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('webviewer');
                }
                
                GUIManager.registerWindow(pid, this.window, {
                    title: 'WebViewer',
                    icon: icon,
                    onClose: () => {
                        if (typeof ProcessManager !== 'undefined') {
                            ProcessManager.killProgram(this.pid);
                        }
                    }
                });
            }
            
            // 创建工具栏
            const toolbar = this._createToolbar();
            this.window.appendChild(toolbar);
            
            // 创建内容区域（iframe容器）
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到GUI容器
            guiContainer.appendChild(this.window);
            
            // 如果指定了初始文件夹路径，直接加载
            if (initArgs && initArgs.args && initArgs.args.length > 0) {
                const folderPath = initArgs.args[0];
                await this._loadFolder(folderPath);
            } else {
                // 否则打开文件夹选择器
                await this._openFolderSelector();
            }
        },
        
        /**
         * 创建工具栏
         */
        _createToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'webviewer-toolbar';
            toolbar.style.cssText = `
                height: 56px;
                min-height: 56px;
                max-height: 56px;
                flex-shrink: 0;
                box-sizing: border-box;
                overflow: hidden;
            `;
            
            // 打开文件夹按钮
            const openBtn = this._createToolbarButton('📁', '打开文件夹', () => {
                this._openFolderSelector();
            });
            toolbar.appendChild(openBtn);
            
            // 刷新按钮
            const refreshBtn = this._createToolbarButton('↻', '刷新', () => {
                if (this.currentIndexHtml) {
                    this._loadIndexHtml(this.currentIndexHtml);
                }
            });
            toolbar.appendChild(refreshBtn);
            
            // 当前路径显示
            const pathDisplay = document.createElement('div');
            pathDisplay.className = 'webviewer-path-display';
            pathDisplay.style.cssText = `
                flex: 1;
                padding: 0 16px;
                display: flex;
                align-items: center;
                color: rgba(215, 224, 221, 0.7);
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            this.pathDisplay = pathDisplay;
            toolbar.appendChild(pathDisplay);
            
            return toolbar;
        },
        
        /**
         * 创建工具栏按钮
         */
        _createToolbarButton: function(text, title, onClick) {
            const btn = document.createElement('button');
            btn.className = 'webviewer-toolbar-btn';
            btn.textContent = text;
            btn.title = title;
            btn.style.cssText = `
                width: 36px;
                height: 36px;
                border: none;
                background: rgba(139, 92, 246, 0.1);
                color: rgba(215, 224, 221, 0.9);
                border-radius: 8px;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                user-select: none;
                margin-left: 8px;
            `;
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(139, 92, 246, 0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(139, 92, 246, 0.1)';
            });
            return btn;
        },
        
        /**
         * 创建内容区域（iframe容器）
         */
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'webviewer-content';
            content.style.cssText = `
                flex: 1;
                position: relative;
                overflow: hidden;
                background: #ffffff;
            `;
            
            // 创建隔离的iframe容器
            const iframeContainer = document.createElement('div');
            iframeContainer.className = 'webviewer-iframe-container';
            iframeContainer.style.cssText = `
                width: 100%;
                height: 100%;
                position: relative;
                isolation: isolate;
                contain: layout style paint;
            `;
            
            const iframe = document.createElement('iframe');
            iframe.className = 'webviewer-iframe';
            iframe.frameBorder = '0';
            iframe.allow = 'fullscreen';
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: #ffffff;
            `;
            
            this.iframe = iframe;
            iframeContainer.appendChild(iframe);
            content.appendChild(iframeContainer);
            
            // 加载指示器
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'webviewer-loading-indicator';
            loadingIndicator.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: rgba(26, 31, 46, 0.9);
                z-index: 1000;
            `;
            loadingIndicator.innerHTML = `
                <div style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(139, 92, 246, 0.2);
                    border-top-color: rgba(139, 92, 246, 0.8);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                "></div>
                <div style="
                    margin-top: 16px;
                    color: rgba(215, 224, 221, 0.9);
                    font-size: 14px;
                ">正在加载...</div>
            `;
            
            // 添加旋转动画
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
            
            content.appendChild(loadingIndicator);
            this.loadingIndicator = loadingIndicator;
            
            // 空状态提示
            const emptyState = document.createElement('div');
            emptyState.className = 'webviewer-empty-state';
            emptyState.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: rgba(26, 31, 46, 0.95);
                color: rgba(215, 224, 221, 0.7);
                font-size: 16px;
            `;
            emptyState.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;">🌐</div>
                <div>请选择一个包含 index.html 的文件夹</div>
            `;
            this.emptyState = emptyState;
            content.appendChild(emptyState);
            
            // 监听iframe加载状态
            iframe.addEventListener('load', () => {
                this.loadingIndicator.style.display = 'none';
                if (this.currentIndexHtml) {
                    this.emptyState.style.display = 'none';
                }
            });
            
            iframe.addEventListener('loadstart', () => {
                this.loadingIndicator.style.display = 'flex';
            });
            
            return content;
        },
        
        /**
         * 打开文件夹选择器
         */
        _openFolderSelector: async function() {
            if (typeof ProcessManager === 'undefined') {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                } else {
                    alert('ProcessManager 不可用');
                }
                return;
            }
            
            try {
                // 启动文件管理器作为文件夹选择器
                // 使用自定义模式：folder-selector
                const fileManagerPid = await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        // 文件夹选择回调
                        if (folderItem && folderItem.path) {
                            await this._loadFolder(folderItem.path);
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('WebViewer', `打开文件夹选择器失败: ${error.message}`);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`打开文件夹选择器失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`打开文件夹选择器失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 加载文件夹
         */
        _loadFolder: async function(folderPath) {
            try {
                // 规范化路径：将双斜杠替换为单斜杠
                let normalizedPath = folderPath;
                if (normalizedPath) {
                    // 处理 C://test 这种情况，转换为 C:/test
                    normalizedPath = normalizedPath.replace(/([CD]:)\/\/+/g, '$1/');
                    // 处理其他双斜杠情况
                    normalizedPath = normalizedPath.replace(/\/\/+/g, '/');
                }
                
                this.currentFolder = normalizedPath;
                
                // 更新路径显示
                if (this.pathDisplay) {
                    this.pathDisplay.textContent = normalizedPath || '未选择文件夹';
                }
                
                // 查找index.html
                const indexHtmlPath = await this._findIndexHtml(normalizedPath);
                
                if (!indexHtmlPath) {
                    // 未找到index.html
                    this.emptyState.style.display = 'flex';
                    this.emptyState.innerHTML = `
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <div>未找到 index.html 文件</div>
                        <div style="font-size: 12px; margin-top: 8px; color: rgba(215, 224, 221, 0.5);">路径: ${normalizedPath}</div>
                    `;
                    if (this.iframe) {
                        this.iframe.src = 'about:blank';
                    }
                    return;
                }
                
                // 加载index.html
                await this._loadIndexHtml(indexHtmlPath);
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('WebViewer', `加载文件夹失败: ${error.message}`);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`加载文件夹失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`加载文件夹失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 查找文件夹中的index.html
         */
        _findIndexHtml: async function(folderPath) {
            try {
                // 使用ProcessManager的FileSystem API列出文件夹内容
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 不可用');
                }
                
                // 规范化路径：NodeTree 使用精确匹配，需要确保路径格式正确
                // 文件管理器可能返回 C://test，但 NodeTree 存储的是 C:/test
                let normalizedPath = folderPath;
                let originalPath = folderPath;
                
                // 尝试两种路径格式：先尝试单斜杠（NodeTree 的标准格式），如果失败再尝试双斜杠
                const pathVariants = [];
                if (normalizedPath) {
                    // 生成所有可能的路径变体
                    // 1. 单斜杠格式：C:/test
                    const singleSlash = normalizedPath.replace(/([CD]:)\/\/+/g, '$1/').replace(/\/\/+/g, '/');
                    pathVariants.push(singleSlash);
                    
                    // 2. 双斜杠格式：C://test（如果原始路径是双斜杠）
                    if (normalizedPath.includes('//')) {
                        const doubleSlash = normalizedPath.replace(/([CD]:)\/\/+/g, '$1//').replace(/([^:])\/\/+/g, '$1/');
                        if (doubleSlash !== singleSlash) {
                            pathVariants.push(doubleSlash);
                        }
                    }
                }
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('WebViewer', `查找index.html，原始路径: ${originalPath}，尝试路径变体:`, pathVariants);
                }
                
                // 使用FileSystem.list API列出文件夹内容，尝试所有路径变体
                let listResult = null;
                let workingPath = null;
                let lastError = null;
                
                for (const pathVariant of pathVariants) {
                    try {
                        listResult = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.list', [pathVariant]);
                        workingPath = pathVariant;
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('WebViewer', `路径变体成功: ${pathVariant}`);
                        }
                        break;
                    } catch (error) {
                        lastError = error;
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('WebViewer', `路径变体失败: ${pathVariant}, 错误: ${error.message}`);
                        }
                    }
                }
                
                if (!listResult) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('WebViewer', `所有路径变体都失败，最后错误: ${lastError?.message}`);
                    }
                    throw lastError || new Error('无法列出目录内容');
                }
                
                normalizedPath = workingPath;
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('WebViewer', `FileSystem.list 返回结果:`, {
                        hasResult: !!listResult,
                        filesCount: listResult?.files?.length || 0,
                        directoriesCount: listResult?.directories?.length || 0,
                        files: listResult?.files?.map(f => ({ name: f.name, path: f.path })) || [],
                        directories: listResult?.directories?.map(d => ({ name: d.name, path: d.path })) || [],
                        resultPath: listResult?.path
                    });
                }
                
                if (!listResult) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('WebViewer', `FileSystem.list 返回空结果，路径: ${normalizedPath}`);
                    }
                    return null;
                }
                
                if (!listResult.files || !Array.isArray(listResult.files)) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('WebViewer', `FileSystem.list 返回的文件列表无效，路径: ${normalizedPath}`);
                    }
                    return null;
                }
                
                // 查找index.html文件（不区分大小写）
                const indexFile = listResult.files.find(file => {
                    if (!file || !file.name) {
                        return false;
                    }
                    const fileName = file.name.toLowerCase();
                    return fileName === 'index.html' || fileName === 'index.htm';
                });
                
                if (indexFile) {
                    // 返回完整路径，确保路径格式正确
                    let indexPath = indexFile.path;
                    if (!indexPath) {
                        // 如果没有path，手动构建
                        const separator = normalizedPath.endsWith('/') ? '' : '/';
                        indexPath = `${normalizedPath}${separator}${indexFile.name}`;
                    }
                    // 规范化返回的路径
                    indexPath = indexPath.replace(/([CD]:)\/\/+/g, '$1/').replace(/\/\/+/g, '/');
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('WebViewer', `找到index.html: ${indexPath}`);
                    }
                    
                    return indexPath;
                }
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WebViewer', `未找到index.html文件，路径: ${normalizedPath}，文件列表: ${listResult.files.map(f => f.name).join(', ')}`);
                }
                
                return null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('WebViewer', `查找index.html失败: ${error.message}`, { 
                        folderPath,
                        error: error.stack 
                    });
                }
                return null;
            }
        },
        
        /**
         * 加载index.html到iframe
         */
        _loadIndexHtml: async function(indexHtmlPath) {
            try {
                if (!this.iframe) {
                    return;
                }
                
                this.currentIndexHtml = indexHtmlPath;
                this.emptyState.style.display = 'none';
                
                // 转换虚拟路径为实际URL，以便正确处理相对路径资源
                let htmlUrl = indexHtmlPath;
                
                if (typeof ProcessManager !== 'undefined' && ProcessManager.convertVirtualPathToUrl) {
                    htmlUrl = ProcessManager.convertVirtualPathToUrl(indexHtmlPath);
                } else if (indexHtmlPath.startsWith('D:/') || indexHtmlPath.startsWith('C:/')) {
                    // 手动转换虚拟路径
                    const relativePath = indexHtmlPath.substring(3);
                    const disk = indexHtmlPath.startsWith('D:/') ? 'D' : 'C';
                    htmlUrl = `/service/DISK/${disk}/${relativePath}`;
                } else if (!indexHtmlPath.startsWith('http://') && !indexHtmlPath.startsWith('https://') && !indexHtmlPath.startsWith('/')) {
                    // 相对路径，保持原样
                    htmlUrl = indexHtmlPath;
                }
                
                // 设置iframe源（直接使用URL，这样HTML中的相对路径资源可以正确加载）
                this.iframe.src = htmlUrl;
                
                // 更新窗口标题
                if (this.window && this.pid) {
                    const folderName = indexHtmlPath.split('/').slice(-2, -1)[0] || 'WebViewer';
                    const newTitle = `WebViewer - ${folderName}`;
                    
                    // 更新标题栏中的标题元素
                    const titleElement = this.window.querySelector('.zos-window-title');
                    if (titleElement) {
                        titleElement.textContent = newTitle;
                    }
                    
                    // 更新窗口信息中的标题（如果GUIManager可用）
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(this.pid);
                        windows.forEach(winInfo => {
                            if (winInfo.window === this.window) {
                                winInfo.title = newTitle;
                            }
                        });
                    }
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('WebViewer', `加载index.html失败: ${error.message}`);
                }
                this.emptyState.style.display = 'flex';
                this.emptyState.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                    <div>加载失败</div>
                    <div style="font-size: 12px; margin-top: 8px; color: rgba(215, 224, 221, 0.5);">${error.message}</div>
                `;
            }
        },
        
        /**
         * 程序退出
         */
        __exit__: function() {
            // 注销窗口
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }
            
            // 清理 DOM
            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            
            // 清理引用
            this.window = null;
            this.iframe = null;
            this.pathDisplay = null;
            this.loadingIndicator = null;
            this.emptyState = null;
            this.currentFolder = null;
            this.currentIndexHtml = null;
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'WebViewer',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS WebViewer - 静态网页容器，用于运行用户编写的静态网页',
                pid: this.pid,
                status: this.window ? 'running' : 'exited',
                currentFolder: this.currentFolder,
                currentIndexHtml: this.currentIndexHtml,
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.PROCESS_MANAGE
                ] : [],
                metadata: {
                    system: true,  // 系统程序
                    allowMultipleInstances: true  // 支持多开
                }
            };
        }
    };
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.WEBVIEWER = WEBVIEWER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.WEBVIEWER = WEBVIEWER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

