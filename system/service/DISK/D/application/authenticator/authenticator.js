// ZerOS 密钥管理器
// 负责公钥私钥的生成、导入、查看、删除等管理功能

(function (window) {
    'use strict';

    const AUTHENTICATOR = {
        pid: null,
        window: null,
        windowId: null,
        keyListContainer: null,
        selectedKeyId: null,
        refreshTimer: null,

        __init__: async function (pid, initArgs) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('Authenticator', `__init__ 被调用, PID: ${pid}`);
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

            // 确保 CryptDrive 已初始化
            if (typeof CryptDrive !== 'undefined') {
                try {
                    await CryptDrive.init();
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Authenticator', `CryptDrive 初始化失败: ${error.message}`);
                    }
                }
            }

            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'authenticator-window zos-gui-window';
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
                    icon = ApplicationAssetManager.getIcon('authenticator');
                }

                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '密钥管理器',
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
            content.className = 'authenticator-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            `;

            // 创建左侧密钥列表
            const leftPanel = this._createKeyListPanel();
            content.appendChild(leftPanel);

            // 创建右侧详情面板
            const rightPanel = this._createDetailPanel();
            content.appendChild(rightPanel);

            this.window.appendChild(content);

            // 添加到容器
            guiContainer.appendChild(this.window);

            // 注册键盘快捷键
            this._registerKeyboardShortcuts();
            
            // 注册右键菜单
            this._registerKeyContextMenu();
            
            // 延迟加载密钥列表，确保进程已完全注册
            setTimeout(async () => {
                await this._refreshKeyList();
            }, 100);
        },

        __exit__: async function () {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('Authenticator', '__exit__ 被调用');
            }

            // 清理定时器
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }

            // 取消注册 GUI 窗口
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.pid, this.windowId);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }

            // 清理引用
            this.window = null;
            this.keyListContainer = null;
            this.selectedKeyId = null;
        },

        __info__: function () {
            return {
                name: '密钥管理器',
                type: 'GUI',
                description: 'RSA 公钥私钥管理工具',
                version: '1.0.0',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,      // 创建GUI窗口
                    PermissionManager.PERMISSION.EVENT_LISTENER,          // 注册事件监听器（键盘快捷键、点击事件等）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,   // 读取系统存储（LStorage，获取密钥数据）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,  // 写入系统存储（LStorage，保存密钥数据）
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,      // 导出密钥需要文件写入权限
                    PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,     // 生成密钥对
                    PermissionManager.PERMISSION.CRYPT_IMPORT_KEY,      // 导入密钥对
                    PermissionManager.PERMISSION.CRYPT_DELETE_KEY,      // 删除密钥
                    PermissionManager.PERMISSION.CRYPT_ENCRYPT,         // 加密数据（用于密钥操作）
                    PermissionManager.PERMISSION.CRYPT_DECRYPT          // 解密数据（用于密钥操作）
                    // 注意：启动 filemanager 程序不需要 PROCESS_MANAGE 权限，因为 startProgram 是内核提供的标准功能
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
            toolbar.className = 'authenticator-toolbar';
            toolbar.style.cssText = `
                height: 48px;
                min-height: 48px;
                max-height: 48px;
                flex: 0 0 48px;
                display: flex;
                align-items: center;
                padding: 0 16px;
                gap: 8px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(20, 20, 30, 0.5);
                box-sizing: border-box;
            `;

            // 生成密钥按钮
            const generateBtn = this._createButton('生成密钥', async () => {
                await this._showGenerateKeyDialog();
            });
            toolbar.appendChild(generateBtn);

            // 导入密钥按钮
            const importBtn = this._createButton('导入密钥', async () => {
                await this._showImportKeyDialog();
            });
            toolbar.appendChild(importBtn);

            // 刷新按钮
            const refreshBtn = this._createButton('刷新', async () => {
                await this._refreshKeyList();
            });
            toolbar.appendChild(refreshBtn);

            return toolbar;
        },

        /**
         * 创建按钮
         */
        _createButton: function (text, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                padding: 6px 16px;
                background: rgba(108, 142, 255, 0.2);
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 6px;
                color: rgba(215, 224, 221, 0.9);
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s ease;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(108, 142, 255, 0.3)';
                btn.style.borderColor = 'rgba(108, 142, 255, 0.5)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(108, 142, 255, 0.2)';
                btn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
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
         * 创建密钥列表面板
         */
        _createKeyListPanel: function () {
            const panel = document.createElement('div');
            panel.className = 'authenticator-key-list-panel';
            panel.style.cssText = `
                width: 300px;
                border-right: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                background: rgba(20, 20, 30, 0.3);
            `;

            // 列表标题
            const title = document.createElement('div');
            title.textContent = '密钥列表';
            title.style.cssText = `
                height: 40px;
                display: flex;
                align-items: center;
                padding: 0 16px;
                font-size: 14px;
                font-weight: bold;
                color: rgba(215, 224, 221, 0.9);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
            `;
            panel.appendChild(title);

            // 列表容器
            this.keyListContainer = document.createElement('div');
            this.keyListContainer.className = 'authenticator-key-list';
            this.keyListContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
            `;
            panel.appendChild(this.keyListContainer);

            return panel;
        },

        /**
         * 创建详情面板
         */
        _createDetailPanel: function () {
            const panel = document.createElement('div');
            panel.className = 'authenticator-detail-panel';
            panel.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                background: rgba(20, 20, 30, 0.2);
            `;

            // 详情内容
            const detailContent = document.createElement('div');
            detailContent.id = 'authenticator-detail-content';
            detailContent.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
                color: rgba(215, 224, 221, 0.8);
            `;

            const placeholder = document.createElement('div');
            placeholder.textContent = '请从左侧选择一个密钥查看详情';
            placeholder.style.cssText = `
                text-align: center;
                color: rgba(215, 224, 221, 0.5);
                margin-top: 100px;
                font-size: 14px;
            `;
            detailContent.appendChild(placeholder);

            panel.appendChild(detailContent);

            return panel;
        },

        /**
         * 刷新密钥列表
         */
        _refreshKeyList: async function () {
            if (!this.keyListContainer) {
                return;
            }

            if (typeof ProcessManager === 'undefined') {
                this.keyListContainer.innerHTML = '<div style="padding: 16px; color: rgba(255, 95, 87, 0.8);">ProcessManager 不可用</div>';
                return;
            }

            try {
                // 确保 CryptDrive 已初始化
                if (typeof CryptDrive !== 'undefined' && !CryptDrive._initialized) {
                    await CryptDrive.init();
                }
                
                // 通过 ProcessManager 调用 CryptDrive API
                const keys = await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.listKeys',
                    []
                ) || [];

                this.keyListContainer.innerHTML = '';

                if (keys.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.textContent = '暂无密钥';
                    emptyMsg.style.cssText = `
                        padding: 16px;
                        text-align: center;
                        color: rgba(215, 224, 221, 0.5);
                        font-size: 13px;
                    `;
                    this.keyListContainer.appendChild(emptyMsg);
                    return;
                }

                // 按创建时间倒序排列
                keys.sort((a, b) => b.createdAt - a.createdAt);

                keys.forEach(keyInfo => {
                    const keyItem = this._createKeyListItem(keyInfo);
                    this.keyListContainer.appendChild(keyItem);
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '刷新密钥列表失败', error);
                }
                this.keyListContainer.innerHTML = `<div style="padding: 16px; color: rgba(255, 95, 87, 0.8);">加载失败: ${error.message}</div>`;
            }
        },

        /**
         * 创建密钥列表项
         */
        _createKeyListItem: function (keyInfo) {
            const item = document.createElement('div');
            item.className = 'authenticator-key-item';
            item.dataset.keyId = keyInfo.keyId;

            const isSelected = this.selectedKeyId === keyInfo.keyId;

            item.style.cssText = `
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                background: ${isSelected ? 'rgba(108, 142, 255, 0.15)' : 'transparent'};
                transition: background 0.2s ease;
            `;

            // 密钥名称（使用描述或ID）
            const name = document.createElement('div');
            name.textContent = keyInfo.description || keyInfo.keyId;
            name.style.cssText = `
                font-size: 13px;
                font-weight: ${isSelected ? 'bold' : 'normal'};
                color: rgba(215, 224, 221, ${isSelected ? '1' : '0.9'});
                margin-bottom: 4px;
            `;
            item.appendChild(name);

            // 密钥信息
            const info = document.createElement('div');
            info.style.cssText = `
                font-size: 11px;
                color: rgba(215, 224, 221, 0.6);
            `;

            const infoParts = [];
            if (keyInfo.isDefault) {
                infoParts.push('默认');
            }
            const createdDate = new Date(keyInfo.createdAt);
            infoParts.push(createdDate.toLocaleDateString());
            if (keyInfo.expiresAt) {
                const expiresDate = new Date(keyInfo.expiresAt);
                if (expiresDate < new Date()) {
                    infoParts.push('已过期');
                } else {
                    infoParts.push(`过期: ${expiresDate.toLocaleDateString()}`);
                }
            }

            info.textContent = infoParts.join(' • ');
            item.appendChild(info);

            // 点击选择
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target.closest('.authenticator-key-item') === item) {
                        e.stopPropagation();
                        this._selectKey(keyInfo.keyId);
                    }
                }, {
                    priority: 100,
                    selector: null
                });
            } else {
                item.addEventListener('click', () => {
                    this._selectKey(keyInfo.keyId);
                });
            }

            // 悬停效果
            item.addEventListener('mouseenter', () => {
                if (this.selectedKeyId !== keyInfo.keyId) {
                    item.style.background = 'rgba(108, 142, 255, 0.08)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (this.selectedKeyId !== keyInfo.keyId) {
                    item.style.background = 'transparent';
                }
            });

            return item;
        },

        /**
         * 选择密钥
         */
        _selectKey: async function (keyId) {
            this.selectedKeyId = keyId;

            // 更新列表项样式
            const items = this.keyListContainer.querySelectorAll('.authenticator-key-item');
            items.forEach(item => {
                const itemKeyId = item.dataset.keyId;
                if (itemKeyId === keyId) {
                    item.style.background = 'rgba(108, 142, 255, 0.15)';
                    const name = item.querySelector('div');
                    if (name) {
                        name.style.fontWeight = 'bold';
                        name.style.color = 'rgba(215, 224, 221, 1)';
                    }
                } else {
                    item.style.background = 'transparent';
                    const name = item.querySelector('div');
                    if (name) {
                        name.style.fontWeight = 'normal';
                        name.style.color = 'rgba(215, 224, 221, 0.9)';
                    }
                }
            });

            // 显示详情
            await this._showKeyDetail(keyId);
        },

        /**
         * 显示密钥详情
         */
        _showKeyDetail: async function (keyId) {
            const detailContent = document.getElementById('authenticator-detail-content');
            if (!detailContent) {
                return;
            }

            if (typeof ProcessManager === 'undefined') {
                detailContent.innerHTML = '<div style="color: rgba(255, 95, 87, 0.8);">ProcessManager 不可用</div>';
                return;
            }

            try {
                // 通过 ProcessManager 调用 CryptDrive API
                const keyInfo = await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.getKeyInfo',
                    [keyId]
                );
                if (!keyInfo) {
                    detailContent.innerHTML = '<div style="color: rgba(255, 95, 87, 0.8);">密钥不存在或已过期</div>';
                    return;
                }

                // 获取完整密钥信息（包括私钥）
                const fullKeyInfo = await this._getFullKeyInfo(keyId);

                detailContent.innerHTML = '';

                // 密钥基本信息
                const basicInfo = document.createElement('div');
                basicInfo.style.cssText = 'margin-bottom: 24px;';

                const title = document.createElement('h3');
                title.textContent = keyInfo.description || keyInfo.keyId;
                title.style.cssText = `
                    font-size: 18px;
                    font-weight: bold;
                    color: rgba(215, 224, 221, 1);
                    margin-bottom: 16px;
                `;
                basicInfo.appendChild(title);

                // 密钥ID
                const keyIdRow = this._createDetailRow('密钥ID', keyInfo.keyId);
                basicInfo.appendChild(keyIdRow);

                // 创建时间
                const createdAt = new Date(keyInfo.createdAt);
                const createdAtRow = this._createDetailRow('创建时间', createdAt.toLocaleString());
                basicInfo.appendChild(createdAtRow);

                // 过期时间
                if (keyInfo.expiresAt) {
                    const expiresAt = new Date(keyInfo.expiresAt);
                    const expiresAtRow = this._createDetailRow('过期时间', expiresAt.toLocaleString());
                    basicInfo.appendChild(expiresAtRow);
                } else {
                    const expiresAtRow = this._createDetailRow('过期时间', '永不过期');
                    basicInfo.appendChild(expiresAtRow);
                }

                // 是否默认
                const isDefaultRow = this._createDetailRow('默认密钥', keyInfo.isDefault ? '是' : '否');
                basicInfo.appendChild(isDefaultRow);

                // 标签
                if (keyInfo.tags && keyInfo.tags.length > 0) {
                    const tagsRow = this._createDetailRow('标签', keyInfo.tags.join(', '));
                    basicInfo.appendChild(tagsRow);
                }

                detailContent.appendChild(basicInfo);

                // 公钥
                const publicKeySection = this._createKeySection('公钥', fullKeyInfo.publicKey, true);
                detailContent.appendChild(publicKeySection);

                // 私钥
                const privateKeySection = this._createKeySection('私钥', fullKeyInfo.privateKey, false);
                detailContent.appendChild(privateKeySection);

                // 操作按钮
                const actions = document.createElement('div');
                actions.style.cssText = 'margin-top: 24px; display: flex; gap: 8px;';

                // 设置为默认按钮
                if (!keyInfo.isDefault) {
                    const setDefaultBtn = this._createActionButton('设为默认', async () => {
                        await this._setDefaultKey(keyId);
                    });
                    actions.appendChild(setDefaultBtn);
                }

                // 导出密钥按钮
                const exportBtn = this._createActionButton('导出密钥', async () => {
                    await this._exportKey(keyId, fullKeyInfo);
                });
                actions.appendChild(exportBtn);

                // 删除密钥按钮
                const deleteBtn = this._createActionButton('删除密钥', async () => {
                    await this._deleteKey(keyId);
                }, true);
                actions.appendChild(deleteBtn);

                detailContent.appendChild(actions);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '显示密钥详情失败', error);
                }
                detailContent.innerHTML = `<div style="color: rgba(255, 95, 87, 0.8);">加载失败: ${error.message}</div>`;
            }
        },

        /**
         * 获取完整密钥信息（包括私钥）
         */
        _getFullKeyInfo: async function (keyId) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            try {
                const keyInfo = await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.getKeyInfo',
                    [keyId]
                );

                if (!keyInfo) {
                    throw new Error('密钥不存在');
                }

                // 从 LStorage 获取完整密钥（包括私钥）
                if (typeof LStorage !== 'undefined') {
                    try {
                        // 使用正确的存储键名
                        const storageKey = typeof CryptDrive !== 'undefined' && CryptDrive.STORAGE_KEY 
                            ? CryptDrive.STORAGE_KEY 
                            : 'cryptDrive.keys';
                        const cryptData = await LStorage.getSystemStorage(storageKey);
                        if (cryptData && cryptData.keys && cryptData.keys[keyId]) {
                            const fullKey = {
                                publicKey: cryptData.keys[keyId].publicKey,
                                privateKey: cryptData.keys[keyId].privateKey,
                                ...keyInfo
                            };
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('Authenticator', `从 LStorage 获取完整密钥: keyId=${keyId}, 有私钥=${!!fullKey.privateKey}`);
                            }
                            
                            return fullKey;
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('Authenticator', `从 LStorage 获取密钥失败: ${error.message}`);
                        }
                    }
                }

                // 如果无法从 LStorage 获取，尝试从 CryptDrive 直接获取
                if (typeof CryptDrive !== 'undefined') {
                    try {
                        // CryptDrive 内部存储了完整的密钥信息
                        if (CryptDrive._keys && CryptDrive._keys.keys && CryptDrive._keys.keys[keyId]) {
                            const keyData = CryptDrive._keys.keys[keyId];
                            return {
                                publicKey: keyData.publicKey,
                                privateKey: keyData.privateKey,
                                ...keyInfo
                            };
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('Authenticator', `从 CryptDrive 获取密钥失败: ${error.message}`);
                        }
                    }
                }

                // 如果无法获取私钥，只返回公钥
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('Authenticator', `无法获取私钥: keyId=${keyId}`);
                }
                
                return {
                    publicKey: keyInfo.publicKey,
                    privateKey: null,
                    ...keyInfo
                };
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '获取完整密钥信息失败', error);
                }
                throw error;
            }
        },

        /**
         * 创建详情行
         */
        _createDetailRow: function (label, value) {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom: 12px;';

            const labelEl = document.createElement('div');
            labelEl.textContent = label + ':';
            labelEl.style.cssText = `
                                font-size: 12px;
                                color: rgba(215, 224, 221, 0.6);
                                margin-bottom: 4px;
                            `;
            row.appendChild(labelEl);

            const valueEl = document.createElement('div');
            valueEl.textContent = value;
            valueEl.style.cssText = `
                                font-size: 13px;
                                color: rgba(215, 224, 221, 0.9);
                                word-break: break-all;
                            `;
            row.appendChild(valueEl);

            return row;
        },

        /**
         * 创建密钥显示区域
         */
        _createKeySection: function (title, key, isPublic) {
            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom: 24px;';

            const titleEl = document.createElement('h4');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                                font-size: 14px;
                                font-weight: bold;
                                color: rgba(215, 224, 221, 0.9);
                                margin-bottom: 8px;
                            `;
            section.appendChild(titleEl);

            const keyContainer = document.createElement('div');
            keyContainer.style.cssText = `
                                background: rgba(20, 20, 30, 0.5);
                                border: 1px solid rgba(108, 142, 255, 0.2);
                                border-radius: 6px;
                                padding: 12px;
                                position: relative;
                            `;

            const keyText = document.createElement('textarea');
            keyText.value = key || '密钥不可用';
            keyText.readOnly = true;
            keyText.style.cssText = `
                                width: 100%;
                                min-height: 80px;
                                background: transparent;
                                border: none;
                                color: rgba(215, 224, 221, 0.8);
                                font-family: 'Courier New', monospace;
                                font-size: 11px;
                                resize: vertical;
                                outline: none;
                            `;
            keyContainer.appendChild(keyText);

            // 复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '复制';
            copyBtn.style.cssText = `
                                position: absolute;
                                top: 8px;
                                right: 8px;
                                padding: 4px 8px;
                                background: rgba(108, 142, 255, 0.2);
                                border: 1px solid rgba(108, 142, 255, 0.3);
                                border-radius: 4px;
                                color: rgba(215, 224, 221, 0.9);
                                cursor: pointer;
                                font-size: 11px;
                            `;

            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === copyBtn) {
                        e.stopPropagation();
                        keyText.select();
                        document.execCommand('copy');
                        copyBtn.textContent = '已复制';
                        setTimeout(() => {
                            copyBtn.textContent = '复制';
                        }, 2000);
                    }
                }, {
                    priority: 100,
                    selector: null
                });
            } else {
                copyBtn.addEventListener('click', () => {
                    keyText.select();
                    document.execCommand('copy');
                    copyBtn.textContent = '已复制';
                    setTimeout(() => {
                        copyBtn.textContent = '复制';
                    }, 2000);
                });
            }

            keyContainer.appendChild(copyBtn);
            section.appendChild(keyContainer);

            return section;
        },

        /**
         * 创建操作按钮
         */
        _createActionButton: function (text, onClick, isDanger = false) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                                padding: 6px 16px;
                                background: ${isDanger ? 'rgba(255, 95, 87, 0.2)' : 'rgba(108, 142, 255, 0.2)'};
                                border: 1px solid ${isDanger ? 'rgba(255, 95, 87, 0.3)' : 'rgba(108, 142, 255, 0.3)'};
                                border-radius: 6px;
                                color: ${isDanger ? 'rgba(255, 95, 87, 0.9)' : 'rgba(215, 224, 221, 0.9)'};
                                cursor: pointer;
                                font-size: 13px;
                                transition: all 0.2s ease;
                            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = isDanger ? 'rgba(255, 95, 87, 0.3)' : 'rgba(108, 142, 255, 0.3)';
                btn.style.borderColor = isDanger ? 'rgba(255, 95, 87, 0.5)' : 'rgba(108, 142, 255, 0.5)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = isDanger ? 'rgba(255, 95, 87, 0.2)' : 'rgba(108, 142, 255, 0.2)';
                btn.style.borderColor = isDanger ? 'rgba(255, 95, 87, 0.3)' : 'rgba(108, 142, 255, 0.3)';
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
         * 显示生成密钥对话框
         */
        _showGenerateKeyDialog: async function () {
            const result = await this._showCustomDialog({
                title: '生成密钥对',
                width: 500,
                height: 380,
                content: () => {
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 20px;';
                    
                    // 描述输入
                    const descLabel = document.createElement('label');
                    descLabel.textContent = '描述:';
                    descLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(descLabel);
                    
                    const descInput = document.createElement('input');
                    descInput.type = 'text';
                    descInput.id = 'auth-key-description';
                    descInput.placeholder = '密钥描述';
                    descInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 16px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                    container.appendChild(descInput);
                    
                    // 密钥长度选择
                    const sizeLabel = document.createElement('label');
                    sizeLabel.textContent = '密钥长度:';
                    sizeLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(sizeLabel);
                    
                    const sizeSelect = document.createElement('select');
                    sizeSelect.id = 'auth-key-size';
                    sizeSelect.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 16px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                    sizeSelect.innerHTML = '<option value="1024">1024 位</option><option value="2048" selected>2048 位（推荐）</option><option value="4096">4096 位</option>';
                    container.appendChild(sizeSelect);
                    
                    // 过期时间选择
                    const expireLabel = document.createElement('label');
                    expireLabel.textContent = '过期时间:';
                    expireLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(expireLabel);
                    
                    const expireSelect = document.createElement('select');
                    expireSelect.id = 'auth-key-expire';
                    expireSelect.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 16px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                    expireSelect.innerHTML = `
                        <option value="0">永不过期</option>
                        <option value="86400000">1 天</option>
                        <option value="604800000">7 天</option>
                        <option value="2592000000">30 天</option>
                        <option value="7776000000">90 天</option>
                        <option value="31536000000">1 年</option>
                    `;
                    container.appendChild(expireSelect);
                    
                    // 设为默认复选框
                    const defaultLabel = document.createElement('label');
                    defaultLabel.style.cssText = 'display: flex; align-items: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; cursor: pointer;';
                    
                    const defaultCheckbox = document.createElement('input');
                    defaultCheckbox.type = 'checkbox';
                    defaultCheckbox.id = 'auth-set-as-default';
                    defaultCheckbox.style.cssText = 'margin-right: 8px; cursor: pointer;';
                    defaultLabel.appendChild(defaultCheckbox);
                    defaultLabel.appendChild(document.createTextNode('设为默认密钥'));
                    container.appendChild(defaultLabel);
                    
                    return container;
                },
                buttons: [
                    { text: '取消', action: 'cancel' },
                    { 
                        text: '生成', 
                        action: 'confirm', 
                        primary: true,
                        getData: (dialogWindow) => {
                            // 在对话框关闭前获取输入值
                            const descElement = dialogWindow.querySelector('#auth-key-description');
                            const sizeElement = dialogWindow.querySelector('#auth-key-size');
                            const expireElement = dialogWindow.querySelector('#auth-key-expire');
                            const defaultElement = dialogWindow.querySelector('#auth-set-as-default');
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('Authenticator', `查找元素: descElement=${!!descElement}, sizeElement=${!!sizeElement}, expireElement=${!!expireElement}, defaultElement=${!!defaultElement}`);
                            }
                            
                            const expireValue = parseInt(expireElement?.value || '0');
                            const data = {
                                description: descElement?.value || '',
                                keySize: parseInt(sizeElement?.value || '2048'),
                                expiresIn: expireValue === 0 ? null : expireValue,
                                setAsDefault: defaultElement?.checked || false
                            };
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('Authenticator', `获取到的数据: ${JSON.stringify(data)}`);
                            }
                            
                            return data;
                        }
                    }
                ]
            });

            // 处理结果：可能是字符串 'confirm' 或对象 { action: 'confirm', data: {...} }
            const isConfirm = result === 'confirm' || (result && typeof result === 'object' && result.action === 'confirm');
            
            if (isConfirm) {
                // 从返回的数据中获取输入值
                let description = '';
                let keySize = 2048;
                let expiresIn = null;
                let setAsDefault = false;
                
                if (result && typeof result === 'object' && result.data) {
                    // 从返回的数据中获取
                    description = result.data.description || '';
                    keySize = result.data.keySize || 2048;
                    expiresIn = result.data.expiresIn !== undefined ? result.data.expiresIn : null;
                    setAsDefault = result.data.setAsDefault || false;
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('Authenticator', `从对话框数据获取: description=${description}, keySize=${keySize}, expiresIn=${expiresIn}, setAsDefault=${setAsDefault}`);
                    }
                } else {
                    // 降级：尝试从 DOM 获取（可能已经关闭）
                    const descElement = document.getElementById('auth-key-description');
                    const sizeElement = document.getElementById('auth-key-size');
                    const expireElement = document.getElementById('auth-key-expire');
                    const defaultElement = document.getElementById('auth-set-as-default');
                    description = descElement?.value || '';
                    keySize = parseInt(sizeElement?.value || '2048');
                    const expireValue = parseInt(expireElement?.value || '0');
                    expiresIn = expireValue === 0 ? null : expireValue;
                    setAsDefault = defaultElement?.checked || false;
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('Authenticator', `从DOM获取（降级）: description=${description}, keySize=${keySize}, expiresIn=${expiresIn}, setAsDefault=${setAsDefault}`);
                    }
                }

                if (!description) {
                    await this._showAlert('请输入密钥描述', '提示', 'warning');
                    return;
                }

                try {
                    await this._generateKey({
                        keySize: keySize,
                        description: description,
                        expiresIn: expiresIn,
                        setAsDefault: setAsDefault
                    });
                } catch (error) {
                    await this._showAlert(`生成密钥失败: ${error.message}`, '错误', 'error');
                }
            }
        },

        /**
         * 生成密钥
         */
        _generateKey: async function (options) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            try {
                const keyPair = await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.generateKeyPair',
                    [options]
                );

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('Authenticator', `密钥生成成功: ${keyPair.keyId}`);
                }

                // 刷新列表
                await this._refreshKeyList();

                // 自动选择新生成的密钥
                await this._selectKey(keyPair.keyId);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '生成密钥失败', error);
                }
                throw error;
            }
        },

        /**
         * 显示导入密钥对话框
         */
        _showImportKeyDialog: async function () {
            const result = await this._showCustomDialog({
                title: '导入密钥对',
                width: 600,
                height: 500,
                content: () => {
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 20px;';
                    
                    // 公钥输入
                    const pubLabel = document.createElement('label');
                    pubLabel.textContent = '公钥 (PEM 格式):';
                    pubLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(pubLabel);
                    
                    const pubTextarea = document.createElement('textarea');
                    pubTextarea.id = 'auth-import-public-key';
                    pubTextarea.placeholder = '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----';
                    pubTextarea.style.cssText = 'width: 100%; min-height: 100px; padding: 8px; margin-bottom: 16px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-family: monospace; font-size: 11px; box-sizing: border-box; resize: vertical;';
                    container.appendChild(pubTextarea);
                    
                    // 私钥输入
                    const privLabel = document.createElement('label');
                    privLabel.textContent = '私钥 (PEM 格式):';
                    privLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(privLabel);
                    
                    const privTextarea = document.createElement('textarea');
                    privTextarea.id = 'auth-import-private-key';
                    privTextarea.placeholder = '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----';
                    privTextarea.style.cssText = 'width: 100%; min-height: 100px; padding: 8px; margin-bottom: 16px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-family: monospace; font-size: 11px; box-sizing: border-box; resize: vertical;';
                    container.appendChild(privTextarea);
                    
                    // 描述输入
                    const descLabel = document.createElement('label');
                    descLabel.textContent = '描述:';
                    descLabel.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                    container.appendChild(descLabel);
                    
                    const descInput = document.createElement('input');
                    descInput.type = 'text';
                    descInput.id = 'auth-import-key-description';
                    descInput.placeholder = '密钥描述';
                    descInput.style.cssText = 'width: 100%; padding: 8px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                    container.appendChild(descInput);
                    
                    return container;
                },
                buttons: [
                    { text: '取消', action: 'cancel' },
                    { 
                        text: '导入', 
                        action: 'confirm', 
                        primary: true,
                        getData: (dialogWindow) => {
                            // 在对话框关闭前获取输入值
                            const pubElement = dialogWindow.querySelector('#auth-import-public-key');
                            const privElement = dialogWindow.querySelector('#auth-import-private-key');
                            const descElement = dialogWindow.querySelector('#auth-import-key-description');
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('Authenticator', `查找元素: pubElement=${!!pubElement}, privElement=${!!privElement}, descElement=${!!descElement}`);
                            }
                            
                            const data = {
                                publicKey: pubElement?.value || '',
                                privateKey: privElement?.value || '',
                                description: descElement?.value || ''
                            };
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('Authenticator', `获取到的数据: publicKey长度=${data.publicKey.length}, privateKey长度=${data.privateKey.length}, description=${data.description}`);
                            }
                            
                            return data;
                        }
                    }
                ]
            });

            // 处理结果：可能是字符串 'confirm' 或对象 { action: 'confirm', data: {...} }
            const isConfirm = result === 'confirm' || (result && typeof result === 'object' && result.action === 'confirm');
            
            if (isConfirm) {
                // 从返回的数据中获取输入值，或在对话框关闭前获取
                let publicKey = '';
                let privateKey = '';
                let description = '';
                
                if (result && typeof result === 'object' && result.data) {
                    // 从返回的数据中获取
                    publicKey = result.data.publicKey || '';
                    privateKey = result.data.privateKey || '';
                    description = result.data.description || '';
                } else {
                    // 降级：尝试从 DOM 获取（可能已经关闭）
                    const pubElement = document.getElementById('auth-import-public-key');
                    const privElement = document.getElementById('auth-import-private-key');
                    const descElement = document.getElementById('auth-import-key-description');
                    publicKey = pubElement?.value || '';
                    privateKey = privElement?.value || '';
                    description = descElement?.value || '';
                }

                if (!publicKey || !privateKey) {
                    await this._showAlert('公钥和私钥不能为空', '错误', 'error');
                    return;
                }

                try {
                    await this._importKey(publicKey, privateKey, { description: description });
                } catch (error) {
                    await this._showAlert(`导入密钥失败: ${error.message}`, '错误', 'error');
                }
            }
        },

        /**
         * 导入密钥
         */
        _importKey: async function (publicKey, privateKey, options) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            try {
                const keyId = await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.importKeyPair',
                    [publicKey, privateKey, options || {}]
                );

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('Authenticator', `密钥导入成功: ${keyId}`);
                }

                // 刷新列表
                await this._refreshKeyList();

                // 自动选择导入的密钥
                await this._selectKey(keyId);

                // 导入成功，无需弹窗提示
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '导入密钥失败', error);
                }
                throw error;
            }
        },

        /**
         * 设置默认密钥
         */
        _setDefaultKey: async function (keyId) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            try {
                await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.setDefaultKey',
                    [keyId]
                );

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('Authenticator', `已设置默认密钥: ${keyId}`);
                }

                // 刷新列表和详情
                await this._refreshKeyList();
                await this._showKeyDetail(keyId);

                // 设置默认成功，无需弹窗提示
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '设置默认密钥失败', error);
                }
                await this._showAlert(`设置默认密钥失败: ${error.message}`, '错误', 'error');
            }
        },

        /**
         * 导出密钥
         */
        _exportKey: async function (keyId, fullKeyInfo) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            try {
                // 使用文件管理器选择保存位置
                const result = await ProcessManager.startProgram('filemanager', {
                    mode: 'folder-selector',
                    onFolderSelected: async (folderInfo) => {
                        try {
                            // folderInfo 可能是对象（包含 path, name, type 等）或字符串路径
                            let folderPath = '';
                            if (typeof folderInfo === 'string') {
                                folderPath = folderInfo;
                            } else if (folderInfo && typeof folderInfo === 'object') {
                                // 从对象中提取路径
                                folderPath = folderInfo.path || folderInfo.name || '';
                                if (!folderPath) {
                                    throw new Error('无法从文件夹信息中获取路径');
                                }
                            } else {
                                throw new Error('无效的文件夹信息');
                            }

                            // 生成密钥文件内容
                            const keyData = {
                                keyId: keyId,
                                publicKey: fullKeyInfo.publicKey,
                                privateKey: fullKeyInfo.privateKey,
                                description: fullKeyInfo.description || '',
                                createdAt: fullKeyInfo.createdAt,
                                expiresAt: fullKeyInfo.expiresAt,
                                exportedAt: Date.now()
                            };

                            const fileName = `key_${keyId}_${Date.now()}.json`;

                            // 保存文件
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'write_file');
                            url.searchParams.set('path', folderPath);
                            url.searchParams.set('fileName', fileName);
                            url.searchParams.set('writeMod', 'overwrite');

                            const response = await fetch(url.toString(), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    content: JSON.stringify(keyData, null, 2),
                                    isBase64: false
                                })
                            });

                            if (!response.ok) {
                                throw new Error(`保存文件失败: HTTP ${response.status}`);
                            }

                            const saveResult = await response.json();
                            if (saveResult.status !== 'success') {
                                throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                            }

                            // 导出成功，无需弹窗提示
                        } catch (error) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('Authenticator', '导出密钥失败', error);
                            }
                            await this._showAlert(`导出密钥失败: ${error.message}`, '错误', 'error');
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '导出密钥失败', error);
                }
                await this._showAlert(`导出密钥失败: ${error.message}`, '错误', 'error');
            }
        },

        /**
         * 删除密钥
         */
        _deleteKey: async function (keyId) {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 不可用');
            }

            // 确认删除
            const confirmed = await this._showConfirm(`确定要删除密钥 "${keyId}" 吗？\n此操作无法恢复。`, '删除确认', 'danger');
            if (!confirmed) {
                return;
            }

            try {
                await ProcessManager.callKernelAPI(
                    this.pid,
                    'Crypt.deleteKey',
                    [keyId]
                );

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('Authenticator', `密钥已删除: ${keyId}`);
                }

                // 如果删除的是当前选中的密钥，清除选择
                if (this.selectedKeyId === keyId) {
                    this.selectedKeyId = null;
                    const detailContent = document.getElementById('authenticator-detail-content');
                    if (detailContent) {
                        detailContent.innerHTML = '<div style="text-align: center; color: rgba(215, 224, 221, 0.5); margin-top: 100px; font-size: 14px;">请从左侧选择一个密钥查看详情</div>';
                    }
                }

                // 刷新列表
                await this._refreshKeyList();

                // 删除成功，无需弹窗提示
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Authenticator', '删除密钥失败', error);
                }
                await this._showAlert(`删除密钥失败: ${error.message}`, '错误', 'error');
            }
        },

        /**
         * 显示自定义对话框窗口（使用 GUIManager 程序多窗口管理）
         */
        _showCustomDialog: async function (options) {
            return new Promise((resolve) => {
                const guiContainer = ProcessManager.getGUIContainer() || document.getElementById('gui-container') || document.body;
                
                // 创建对话框窗口
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
                
                // 内容区域（标题栏由 GUIManager 自动创建）
                const contentArea = document.createElement('div');
                contentArea.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                `;
                if (typeof options.content === 'function') {
                    contentArea.appendChild(options.content());
                } else if (options.content) {
                    contentArea.innerHTML = options.content;
                }
                dialogWindow.appendChild(contentArea);
                
                // 按钮栏
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
                    // 在关闭前获取数据（如果有回调函数）
                    let result = action;
                    if (data !== null && data !== undefined) {
                        // 如果有数据，返回对象格式
                        result = { action: action, data: data };
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('Authenticator', `对话框关闭，返回数据: action=${action}, data=${JSON.stringify(data)}`);
                        }
                    } else if (typeof options.onClose === 'function') {
                        // 允许通过回调函数获取数据
                        const callbackData = options.onClose(dialogWindow, action);
                        if (callbackData !== undefined && callbackData !== null) {
                            result = { action: action, data: callbackData };
                        }
                    }
                    
                    // 延迟关闭，确保数据已获取
                    setTimeout(() => {
                        if (typeof GUIManager !== 'undefined' && dialogWindowId) {
                            GUIManager.unregisterWindow(dialogWindowId);
                        } else if (dialogWindow.parentElement) {
                            dialogWindow.remove();
                        }
                        resolve(result);
                    }, 0);
                };
                
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
                        transition: all 0.2s;
                    `;
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = btnConfig.primary ? 'rgba(108, 142, 255, 0.2)' : 'rgba(108, 142, 255, 0.1)';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = btnConfig.primary ? 'rgba(108, 142, 255, 0.1)' : 'transparent';
                    });
                    btn.addEventListener('click', () => {
                        // 如果按钮有数据获取函数，先获取数据
                        let buttonData = null;
                        if (typeof btnConfig.getData === 'function') {
                            try {
                                buttonData = btnConfig.getData(dialogWindow);
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('Authenticator', `对话框获取数据: ${JSON.stringify(buttonData)}`);
                                }
                            } catch (error) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('Authenticator', `获取对话框数据失败: ${error.message}`);
                                }
                            }
                        }
                        closeDialog(btnConfig.action, buttonData);
                    });
                    buttonBar.appendChild(btn);
                });
                dialogWindow.appendChild(buttonBar);
                
                // 添加到容器
                guiContainer.appendChild(dialogWindow);
                
                // 注册窗口到 GUIManager（使用程序多窗口管理）
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
            });
        },

        /**
         * 显示提示框（替代 alert）
         */
        _showAlert: async function (message, title = '提示', type = 'info') {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                return await GUIManager.showAlert(message, title, type);
            }
            return await this._showCustomDialog({
                title: title,
                width: 400,
                height: 200,
                content: () => {
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 20px; display: flex; align-items: center; justify-content: center; height: 100%;';
                    const msg = document.createElement('div');
                    msg.textContent = message;
                    msg.style.cssText = `
                        color: rgba(215, 224, 221, 0.9);
                        font-size: 14px;
                        text-align: center;
                        line-height: 1.6;
                    `;
                    container.appendChild(msg);
                    return container;
                },
                buttons: [
                    { text: '确定', action: 'ok', primary: true }
                ]
            });
        },

        /**
         * 显示确认框（替代 confirm）
         */
        _showConfirm: async function (message, title = '确认', type = 'warning') {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                return await GUIManager.showConfirm(message, title, type);
            }
            const result = await this._showCustomDialog({
                title: title,
                width: 400,
                height: 200,
                content: () => {
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 20px; display: flex; align-items: center; justify-content: center; height: 100%;';
                    const msg = document.createElement('div');
                    msg.textContent = message;
                    msg.style.cssText = `
                        color: rgba(215, 224, 221, 0.9);
                        font-size: 14px;
                        text-align: center;
                        line-height: 1.6;
                        white-space: pre-wrap;
                    `;
                    container.appendChild(msg);
                    return container;
                },
                buttons: [
                    { text: '取消', action: 'cancel' },
                    { text: '确定', action: 'confirm', primary: true }
                ]
            });
            return result === 'confirm';
        },

        /**
         * 注册密钥列表项的右键菜单
         */
        _registerKeyContextMenu: function () {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }

            const self = this;

            ContextMenuManager.registerContextMenu(this.pid, {
                context: '*',
                selector: '.authenticator-key-item',
                priority: 100,
                items: (target) => {
                    const item = target.closest('.authenticator-key-item');
                    if (!item || !item.dataset.keyId) {
                        return [];
                    }

                    const keyId = item.dataset.keyId;
                    
                    // 从列表项文本判断是否默认（同步方式）
                    const infoText = item.querySelector('div:last-child')?.textContent || '';
                    const isDefault = infoText.includes('默认');

                    const menuItems = [];

                    // 设为默认（如果不是默认密钥）
                    if (!isDefault) {
                        menuItems.push({
                            label: '设为默认',
                            action: async () => {
                                await self._setDefaultKey(keyId);
                            }
                        });
                    }

                    // 导出密钥
                    menuItems.push({
                        label: '导出密钥',
                        action: async () => {
                            try {
                                const fullKeyInfo = await self._getFullKeyInfo(keyId);
                                await self._exportKey(keyId, fullKeyInfo);
                            } catch (error) {
                                await self._showAlert(`导出密钥失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    });

                    // 删除密钥
                    menuItems.push({
                        label: '删除',
                        action: async () => {
                            await self._deleteKey(keyId);
                        }
                    });

                    return menuItems;
                }
            });
        },

        /**
         * 注册键盘快捷键
         */
        _registerKeyboardShortcuts: function () {
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    // 检查是否在输入框中
                    const activeElement = document.activeElement;
                    if (activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    )) {
                        return;
                    }

                    // F5: 刷新列表
                    if (e.key === 'F5') {
                        e.preventDefault();
                        e.stopPropagation();
                        this._refreshKeyList();
                    }

                    // Delete: 删除选中的密钥
                    if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === 'Delete') {
                        if (this.selectedKeyId) {
                            e.preventDefault();
                            e.stopPropagation();
                            this._deleteKey(this.selectedKeyId);
                        }
                    }
                }, {
                    priority: 100,
                    selector: null // 全局键盘事件
                });
            }
        }
    };

    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.AUTHENTICATOR = AUTHENTICATOR;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.AUTHENTICATOR = AUTHENTICATOR;
    }

})(typeof window !== 'undefined' ? window : globalThis);