// 系统操作扩展：全屏覆盖系统
// 负责在全屏覆盖系统界面上渲染特定内容
// 仅允许 D/server 目录下服务调用（通过 SERVER_SERVICE_PID 放行）

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("SystemExpansion", "模块初始化");
    }

    const SYSTEM_PID = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    const VALID_TYPES = ['SystemProtocol', 'SystemPatch', 'SystemConfiguration'];

    const TYPE_BUTTON_LABELS = {
        'SystemProtocol': {
            next: '下一份协议',
            done: '我已阅读并同意',
            cancel: '我不同意且立即卸载本系统'
        },
        'SystemPatch': {
            next: '我已了解本次补丁的重要性',
            done: '完成安装',
            cancel: '取消'
        },
        'SystemConfiguration': {
            next: '我已配置完成本页',
            done: '完成配置',
            cancel: null
        }
    };

    const TYPE_ICONS = {
        'SystemProtocol': 'M12 2C6.48 2 6 6.48 6 12s.48 10 6 10 6 10 9.52 6 12 2 12 2 5.52 5.52 2 12 2 12 2 18.48 18.48 2 12 2 12 2 17.52 17.52 2 12 2 12 2 12zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
        'SystemPatch': 'M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12zM7 7h10v2H7V7zm0 4h10v2H7v-2z',
        'SystemConfiguration': 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
    };

    function _checkCaller() {
        try {
            const stack = new Error().stack;
            if (!stack) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("SystemExpansion", "无法获取调用栈");
                }
                return false;
            }

            if (stack.includes('terminal') || stack.includes('Terminal') || stack.includes('debug')) {
                return true;
            }

            const lines = stack.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('systemExpansion.js')) continue;

                if (line.includes('system/service/DISK/D/server/')) {
                    const match = line.match(/system\/service\/DISK\/D\/server\/([^:/]+)/);
                    if (match && match[1]) {
                        return true;
                    }
                }
            }

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("SystemExpansion", "非法的调用来源");
            }
            return false;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("SystemExpansion", "调用来源验证失败: " + e.message);
            }
            return false;
        }
    }

    let _overlayContainer = null;
    let _keydownHandlerId = null;
    let _keyupHandlerId = null;
    let _contextmenuHandlerId = null;
    let _currentType = null;
    let _currentAssets = null;
    let _currentMeta = null;
    let _isActive = false;
    let _currentStep = 1;
    let _resolvePromise = null;
    let _errorMessageElement = null;

    let _patchState = {
        url: null,
        description: null,
        version: null,
        status: 'pending',
        progress: 0,
        message: '',
        result: null
    };

    function _getLogoPath() {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.getLogoPath) {
            return SystemInformation.getLogoPath();
        }
        return 'zeros-logo.svg';
    }

    function _createOverlayContainer() {
        if (_overlayContainer) return _overlayContainer;

        _overlayContainer = document.createElement('div');
        _overlayContainer.id = 'system-expansion-overlay';
        _overlayContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.35);
            z-index: 999999;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            backdrop-filter: blur(4px);
        `;

        document.body.appendChild(_overlayContainer);
        return _overlayContainer;
    }

    const _nativeListeners = {
        keydown: null,
        keyup: null,
        contextmenu: null
    };

    function _disableInputs() {
        if (typeof EventManager !== 'undefined' && EventManager.registerEventHandler) {
            _keydownHandlerId = EventManager.registerEventHandler(
                SYSTEM_PID,
                'keydown',
                function(e) {
                    if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.key === 'Tab') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                },
                { priority: 999999, selector: 'body' }
            );

            _keyupHandlerId = EventManager.registerEventHandler(
                SYSTEM_PID,
                'keyup',
                function(e) {
                    if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.key === 'Tab') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                },
                { priority: 999999, selector: 'body' }
            );

            _contextmenuHandlerId = EventManager.registerEventHandler(
                SYSTEM_PID,
                'contextmenu',
                function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                },
                { priority: 999999, selector: 'body' }
            );
        }

        const keydownHandler = function(e) {
            if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const keyupHandler = function(e) {
            if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
            }
         };

        const contextmenuHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
        };

        document.addEventListener('keydown', keydownHandler, { capture: true, passive: false });
        document.addEventListener('keyup', keyupHandler, { capture: true, passive: false });
        document.addEventListener('contextmenu', contextmenuHandler, { capture: true, passive: false });

        _nativeListeners.keydown = keydownHandler;
        _nativeListeners.keyup = keyupHandler;
        _nativeListeners.contextmenu = contextmenuHandler;
    }

    function _enableInputs() {
        if (_keydownHandlerId && typeof EventManager !== 'undefined') {
            EventManager.unregisterEventHandler(_keydownHandlerId);
            _keydownHandlerId = null;
        }
        if (_keyupHandlerId && typeof EventManager !== 'undefined') {
            EventManager.unregisterEventHandler(_keyupHandlerId);
            _keyupHandlerId = null;
        }
        if (_contextmenuHandlerId && typeof EventManager !== 'undefined') {
            EventManager.unregisterEventHandler(_contextmenuHandlerId);
            _contextmenuHandlerId = null;
        }

        if (_nativeListeners.keydown) {
            document.removeEventListener('keydown', _nativeListeners.keydown, { capture: true, passive: false });
            _nativeListeners.keydown = null;
        }
        if (_nativeListeners.keyup) {
            document.removeEventListener('keyup', _nativeListeners.keyup, { capture: true, passive: false });
            _nativeListeners.keyup = null;
        }
        if (_nativeListeners.contextmenu) {
            document.removeEventListener('contextmenu', _nativeListeners.contextmenu, { capture: true, passive: false });
            _nativeListeners.contextmenu = null;
        }
    }

    function _exitOverlay() {
        try {
            if (!_isActive) {
                return { success: false, message: '覆盖层未激活' };
            }

            _enableInputs();
            _clearErrorMessage();

            if (_overlayContainer) {
                _overlayContainer.style.display = 'none';
            }

            _isActive = false;
            _currentType = null;
            _currentAssets = null;
            _currentMeta = null;
            _currentStep = 1;

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("SystemExpansion", '退出覆盖模式');
            }

            return { success: true, message: '成功退出覆盖模式' };
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("SystemExpansion", `退出覆盖模式失败: ${e.message}`);
            }
            return { success: false, message: e.message };
        }
    }

    function _handleAction(isLastStep) {
        const totalSteps = _currentMeta && _currentMeta.step ? _currentMeta.step : 1;

        if (_currentType === 'SystemConfiguration') {
            const validation = _validateCheck();
            if (!validation.valid) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("SystemExpansion", '验证失败: ' + validation.message);
                }
                _showErrorMessage(validation.message);
                return;
            }
        }

        if (!isLastStep && _currentStep < totalSteps) {
            _currentStep++;
            _clearErrorMessage();
            _renderContent();
            return;
        }

        const result = {
            action: isLastStep ? 'done' : 'next',
            step: _currentStep,
            totalSteps: totalSteps,
            isLastStep: true,
            type: _currentType,
            data: _collectFormData()
        };

        _exitOverlay();

        if (_resolvePromise) {
            _resolvePromise(result);
            _resolvePromise = null;
        }
    }

    function _validateCheck() {
        const check = _currentMeta && _currentMeta.check;
        if (!check || !Array.isArray(check) || _currentType !== 'SystemConfiguration') {
            return { valid: true, message: '', data: _collectFormData() };
        }

        const errors = [];

        for (let i = 0; i < check.length; i++) {
            const item = check[i];
            if (!item || !item.idName || !item.typeOf) continue;

            const element = document.getElementById(item.idName);
            if (!element) continue;

            const tagName = element.tagName.toLowerCase();
            const type = (item.typeOf || '').toLowerCase();
            const label = item.label || item.idName;
            let value = null;
            let isValid = true;

            if (tagName === 'input') {
                const inputType = element.type ? element.type.toLowerCase() : 'text';

                switch (type) {
                    case 'text':
                    case 'password':
                    case 'email':
                    case 'number':
                    case 'tel':
                    case 'url':
                    case 'search':
                        value = element.value || '';
                        if (item.required && (!value || value.trim() === '')) {
                            errors.push(label + ' 不能为空');
                            isValid = false;
                        } else if (value) {
                            if (item.minLength && value.length < item.minLength) {
                                errors.push(label + ' 长度不能少于 ' + item.minLength + ' 个字符');
                                isValid = false;
                            }
                            if (item.maxLength && value.length > item.maxLength) {
                                errors.push(label + ' 长度不能超过 ' + item.maxLength + ' 个字符');
                                isValid = false;
                            }
                            if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                                errors.push(label + ' 格式不正确');
                                isValid = false;
                            }
                            if (type === 'url' && !/^https?:\/\/.+/.test(value)) {
                                errors.push(label + ' 格式不正确');
                                isValid = false;
                            }
                            if (type === 'tel' && !/^[\d\s\-\+\(\)]+$/.test(value)) {
                                errors.push(label + ' 格式不正确');
                                isValid = false;
                            }
                        }
                        break;

                    case 'checkbox':
                        value = element.checked;
                        if (item.required && !value) {
                            errors.push(label + ' 必须选中');
                            isValid = false;
                        }
                        break;

                    case 'radio':
                        value = element.checked;
                        if (item.required && !value) {
                            errors.push(label + ' 必须选中');
                            isValid = false;
                        }
                        break;

                    case 'file':
                        value = element.files;
                        if (item.required && (!value || value.length === 0)) {
                            errors.push(label + ' 必须选择文件');
                            isValid = false;
                        }
                        break;

                    case 'range':
                    case 'date':
                    case 'time':
                    case 'datetime-local':
                    case 'month':
                    case 'week':
                        value = element.value || '';
                        if (item.required && (!value || value.trim() === '')) {
                            errors.push(label + ' 不能为空');
                            isValid = false;
                        } else if (value) {
                            if (item.min && parseFloat(value) < item.min) {
                                errors.push(label + ' 值不能小于 ' + item.min);
                                isValid = false;
                            }
                            if (item.max && parseFloat(value) > item.max) {
                                errors.push(label + ' 值不能大于 ' + item.max);
                                isValid = false;
                            }
                        }
                        break;
                }
            } else if (tagName === 'select') {
                value = element.value || '';
                if (item.required && (!value || value.trim() === '')) {
                    errors.push(label + ' 必须选择');
                    isValid = false;
                }
            } else if (tagName === 'textarea') {
                value = element.value || '';
                if (item.required && (!value || value.trim() === '')) {
                    errors.push(label + ' 不能为空');
                    isValid = false;
                } else if (value) {
                    if (item.minLength && value.length < item.minLength) {
                        errors.push(label + ' 长度不能少于 ' + item.minLength + ' 个字符');
                        isValid = false;
                    }
                    if (item.maxLength && value.length > item.maxLength) {
                        errors.push(label + ' 长度不能超过 ' + item.maxLength + ' 个字符');
                        isValid = false;
                    }
                }
            }
        }

        if (errors.length > 0) {
            return { valid: false, message: errors.join('; '), data: _collectFormData() };
        }

        return { valid: true, message: '', data: _collectFormData() };
    }

    function _collectFormData() {
        const data = {};
        const check = _currentMeta && _currentMeta.check;
        if (!check || !Array.isArray(check)) return data;

        for (let i = 0; i < check.length; i++) {
            const item = check[i];
            if (!item || !item.idName) continue;

            const element = document.getElementById(item.idName);
            if (!element) continue;

            const tagName = element.tagName.toLowerCase();

            if (tagName === 'input') {
                const type = element.type ? element.type.toLowerCase() : 'text';
                if (type === 'checkbox') {
                    data[item.idName] = element.checked;
                } else if (type === 'radio') {
                    if (element.checked) {
                        data[item.idName] = element.value;
                    }
                } else if (type === 'file') {
                    if (element.files && element.files.length > 0) {
                        data[item.idName] = element.files[0].name;
                    }
                } else {
                    data[item.idName] = element.value;
                }
            } else if (tagName === 'select') {
                data[item.idName] = element.value;
            } else if (tagName === 'textarea') {
                data[item.idName] = element.value;
            }
        }

        return data;
    }

    function _showErrorMessage(message) {
        if (!_overlayContainer) return;

        if (_errorMessageElement) {
            _errorMessageElement.remove();
        }

        if (!message) return;

        const wrapper = _overlayContainer.querySelector('div');
        if (!wrapper) return;

        const container = wrapper.querySelector(':scope > div');
        if (!container) return;

        const contentArea = container.querySelector('div:nth-child(2)');
        if (!contentArea) return;

        _errorMessageElement = document.createElement('div');
        _errorMessageElement.style.cssText = `
            background: #fde7e7;
            border: 1px solid #e5a5a5;
            border-radius: 4px;
            padding: 12px 16px;
            margin-bottom: 16px;
            color: #c42b1c;
            font-size: 14px;
        `;
        _errorMessageElement.textContent = message;

        contentArea.insertBefore(_errorMessageElement, contentArea.firstChild);
    }

    function _clearErrorMessage() {
        if (_errorMessageElement) {
            _errorMessageElement.remove();
            _errorMessageElement = null;
        }
    }

    function _renderPatchProgress() {
        const status = _patchState.status;
        const progress = _patchState.progress;
        const message = _patchState.message || '';

        let statusText = '';
        let progressBar = '';

        switch (status) {
            case 'downloading':
                statusText = '正在下载更新...';
                progressBar = `<div style="width: 100%; height: 8px; background: #e5e5e5; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: #0078d4; transition: width 0.3s;"></div>
                </div>`;
                break;
            case 'extracting':
                statusText = '正在解压更新包...';
                progressBar = `<div style="width: 100%; height: 8px; background: #e5e5e5; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: #107c10; transition: width 0.3s;"></div>
                </div>`;
                break;
            case 'installing':
                statusText = '正在安装更新...';
                progressBar = `<div style="width: 100%; height: 8px; background: #e5e5e5; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: #ff8c00; transition: width 0.3s;"></div>
                </div>`;
                break;
            case 'completed':
                statusText = '更新安装完成！';
                progressBar = `<div style="width: 100%; height: 8px; background: #107c10; border-radius: 4px;">
                    <div style="width: 100%; height: 100%; background: #107c10;"></div>
                </div>`;
                break;
            case 'failed':
                statusText = '更新安装失败';
                progressBar = `<div style="color: #c42b1c; font-size: 14px;">${message}</div>`;
                break;
            default:
                statusText = '准备中...';
                progressBar = '';
        }

        return `
            <div style="padding: 24px; color: #1a1a1a; text-align: center;">
                <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: ${status === 'completed' ? '#107c10' : status === 'failed' ? '#c42b1c' : '#0078d4'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    ${status === 'completed'
                        ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
                        : status === 'failed'
                        ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
                        : '<svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
                    }
                </div>
                <h2 style="margin: 0 0 8px 0; font-size: 20px;">${statusText}</h2>
                ${progressBar}
                ${message && status !== 'failed' ? `<p style="color: #666; font-size: 14px; margin: 16px 0 0 0;">${message}</p>` : ''}
            </div>
        `;
    }

    function _renderPatchStep1() {
        const version = _patchState.version || '1.0.0';
        const description = _patchState.description || '';
        return `
            <div style="padding: 24px; color: #1a1a1a;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <div style="width: 48px; height: 48px; background: #0078d4; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                            <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12zM7 7h10v2H7V7zm0 4h10v2H7v-2z"/>
                        </svg>
                    </div>
                    <div>
                        <h2 style="margin: 0 0 4px 0; font-size: 20px;">系统更新</h2>
                        <span style="color: #666; font-size: 14px;">版本 ${version}</span>
                    </div>
                </div>
                <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 16px; max-height: 200px; overflow-y: auto;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #666;">本次更新内容：</h3>
                    <div style="white-space: pre-wrap; line-height: 1.6;">${description}</div>
                </div>
                <p style="color: #666; font-size: 13px; margin: 0;">
                    点击「开始安装」将下载并安装更新，安装过程中请勿关闭系统。
                </p>
            </div>
        `;
    }

    async function _startPatchInstall() {
        _patchState.status = 'downloading';
        _patchState.progress = 0;
        _patchState.message = '正在连接服务器...';
        _renderContent();

        try {
            _patchState.message = '正在下载补丁...';
            _patchState.progress = 10;
            _renderContent();

            const tempPath = 'D/cache/temp';
            const fileName = 'patch_' + Date.now() + '.zip';

            const downloadResult = await _downloadPatchFile(_patchState.url, tempPath, fileName, function(progress) {
                _patchState.progress = 10 + Math.floor(progress * 40);
                _patchState.message = `下载中... ${_patchState.progress}%`;
                _renderContent();
            });

            if (!downloadResult.success) {
                throw new Error(downloadResult.message || '下载失败');
            }

            _patchState.status = 'extracting';
            _patchState.progress = 50;
            _patchState.message = '正在解压补丁...';
            _renderContent();

            const extractResult = await _extractPatchFile(downloadResult.path, tempPath, function(progress) {
                _patchState.progress = 50 + Math.floor(progress * 20);
                _patchState.message = `解压中... ${_patchState.progress}%`;
                _renderContent();
            });

            if (!extractResult.success) {
                throw new Error(extractResult.message || '解压失败');
            }

            _patchState.status = 'installing';
            _patchState.progress = 70;
            _patchState.message = '正在安装补丁...';
            _renderContent();

            const installResult = await _installPatchFiles(extractResult.extractedPath, function(progress) {
                _patchState.progress = 70 + Math.floor(progress * 30);
                _patchState.message = `安装中... ${_patchState.progress}%`;
                _renderContent();
            });

            _patchState.status = 'completed';
            _patchState.progress = 100;
            _patchState.message = '更新已安装完成';
            _patchState.result = installResult;
            _renderContent();

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("SystemExpansion", '补丁安装完成', installResult);
            }

        } catch (error) {
            _patchState.status = 'failed';
            _patchState.message = error.message || '安装失败';
            _renderContent();

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("SystemExpansion", '补丁安装失败', error);
            }
        }
    }

    async function _downloadPatchFile(url, targetDir, fileName, onProgress) {
        return new Promise(function(resolve) {
            if (typeof KernelAPI !== 'undefined') {
                KernelAPI.call('FileFramework.download', [url, targetDir, fileName, function(progress) {
                    if (onProgress) onProgress(progress);
                }]).then(function(result) {
                    if (result && result.success) {
                        resolve({ success: true, path: targetDir + '/' + fileName });
                    } else {
                        resolve({ success: false, message: result ? result.message : '下载失败' });
                    }
                }).catch(function(err) {
                    resolve({ success: false, message: err.message });
                });
            } else {
                resolve({ success: false, message: 'FileFramework 不可用' });
            }
        });
    }

    async function _extractPatchFile(zipPath, targetDir, onProgress) {
        return new Promise(function(resolve) {
            if (typeof KernelAPI !== 'undefined') {
                const services = ['ziper', 'zipService', 'compression'];
                let tried = 0;

                const tryNextService = function(index) {
                    if (index >= services.length) {
                        resolve({ success: false, message: '未找到可用的解压服务' });
                        return;
                    }

                    const serviceName = services[index];
                    KernelAPI.call(serviceName + '.extract', [zipPath, targetDir, function(progress) {
                        if (onProgress) onProgress(progress);
                    }]).then(function(result) {
                        if (result && result.success) {
                            resolve({ success: true, extractedPath: targetDir });
                        } else {
                            tried++;
                            tryNextService(index + 1);
                        }
                    }).catch(function() {
                        tried++;
                        tryNextService(index + 1);
                    });
                };

                tryNextService(0);
            } else {
                resolve({ success: false, message: '解压服务不可用' });
            }
        });
    }

    async function _installPatchFiles(sourceDir, onProgress) {
        return new Promise(function(resolve) {
            if (typeof KernelAPI !== 'undefined') {
                const services = ['FileFramework', 'FileSystem', 'FSDrive'];
                let tried = 0;

                const tryNextService = function(index) {
                    if (index >= services.length) {
                        resolve({ success: false, message: '未找到可用的文件系统服务' });
                        return;
                    }

                    const serviceName = services[index];
                    const copyMethod = serviceName === 'FileFramework' ? 'copyDirectoryToPhysical' : 'copyDirectory';

                    if (serviceName === 'FileFramework') {
                        KernelAPI.call('FileFramework.copyDirectoryToPhysical', [sourceDir, '/', true, function(progress) {
                            if (onProgress) onProgress(progress);
                        }]).then(function(result) {
                            if (result && result.success) {
                                resolve({
                                    success: true,
                                    updatedFiles: result && result.files ? result.files : [],
                                    message: result && result.message
                                });
                            } else {
                                tried++;
                                tryNextService(index + 1);
                            }
                        }).catch(function() {
                            tried++;
                            tryNextService(index + 1);
                        });
                    } else {
                        KernelAPI.call(serviceName + '.' + copyMethod, [sourceDir, '/', true, function(progress) {
                            if (onProgress) onProgress(progress);
                        }]).then(function(result) {
                            if (result && result.success) {
                                resolve({
                                    success: true,
                                    updatedFiles: result && result.files ? result.files : [],
                                    message: result && result.message
                                });
                            } else {
                                tried++;
                                tryNextService(index + 1);
                            }
                        }).catch(function() {
                            tried++;
                            tryNextService(index + 1);
                        });
                    }
                };

                tryNextService(0);
            } else {
                resolve({ success: false, message: '文件系统服务不可用' });
            }
        });
    }

    function _renderContent() {
        if (!_overlayContainer) return;

        _overlayContainer.innerHTML = '';

        const container = document.createElement('div');
        container.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #fafafa;
            color: #1a1a1a;
            font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, sans-serif;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;

        const headerArea = document.createElement('div');
        headerArea.style.cssText = `
            width: 100%;
            height: 60px;
            min-height: 60px;
            display: flex;
            align-items: center;
            background: #fff;
            border-bottom: 1px solid #e5e5e5;
            padding: 0 24px;
            box-sizing: border-box;
            gap: 12px;
        `;

        const logoImg = document.createElement('img');
        logoImg.src = _getLogoPath();
        logoImg.style.cssText = `
            width: 24px;
            height: 24px;
            object-fit: contain;
        `;
        headerArea.appendChild(logoImg);

        const titleText = _currentMeta && _currentMeta.title ? _currentMeta.title : '';
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
            letter-spacing: 0.3px;
        `;
        title.textContent = titleText;
        headerArea.appendChild(title);

        container.appendChild(headerArea);

        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
            width: 100%;
            flex: 1;
            overflow: auto;
            padding: 24px;
            box-sizing: border-box;
            background: #fafafa;
        `;

        const isPatchWithUrl = _currentType === 'SystemPatch' && _patchState.url;

        if (isPatchWithUrl && _currentStep === 1) {
            contentArea.innerHTML = _renderPatchStep1();
        } else if (typeof _currentAssets === 'string') {
            contentArea.innerHTML = _currentAssets;
        } else if (typeof _currentAssets === 'function') {
            const stepContent = _currentAssets(_currentStep, _currentMeta);
            if (typeof stepContent === 'string') {
                contentArea.innerHTML = stepContent;
            } else if (stepContent && typeof stepContent.render === 'function') {
                stepContent.render(contentArea, _currentMeta, _currentStep);
            } else {
                contentArea.textContent = JSON.stringify(stepContent, null, 2);
            }
        } else if (_currentAssets && typeof _currentAssets.render === 'function') {
            _currentAssets.render(contentArea, _currentMeta, _currentStep);
        } else {
            contentArea.textContent = JSON.stringify(_currentAssets, null, 2);
        }
        container.appendChild(contentArea);

        const footerArea = document.createElement('div');
        footerArea.style.cssText = `
            width: 100%;
            height: 70px;
            min-height: 70px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            background: #fff;
            border-top: 1px solid #e5e5e5;
            padding: 0 24px;
            box-sizing: border-box;
        `;

        const buttonLabels = TYPE_BUTTON_LABELS[_currentType] || { next: '下一步', done: '完成', cancel: '取消' };
        const totalSteps = _currentMeta && _currentMeta.step ? _currentMeta.step : 1;
        const isLastStep = totalSteps === 1 || _currentStep >= totalSteps;
        const showCancel = buttonLabels.cancel !== null && buttonLabels.cancel !== undefined;

        const isPatchStep1 = isPatchWithUrl && _currentStep === 1 && _patchState.status === 'pending';
        const isPatchCompleted = isPatchWithUrl && _patchState.status === 'completed';
        const isPatchFailed = isPatchWithUrl && _patchState.status === 'failed';

        if (isPatchStep1) {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: transparent;
                color: #1a1a1a;
                border: 1px solid #e5e5e5;
                border-radius: 4px;
                transition: all 0.15s ease;
            `;
            cancelBtn.onmouseenter = function() {
                cancelBtn.style.background = '#f5f5f5';
            };
            cancelBtn.onmouseleave = function() {
                cancelBtn.style.background = 'transparent';
            };
            cancelBtn.onclick = function() {
                _exitOverlay();
            };
            footerArea.appendChild(cancelBtn);

            const installBtn = document.createElement('button');
            installBtn.textContent = '开始安装';
            installBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 4px;
                transition: background 0.15s ease;
            `;
            installBtn.onmouseenter = function() {
                installBtn.style.background = '#106ebe';
            };
            installBtn.onmouseleave = function() {
                installBtn.style.background = '#0078d4';
            };
            installBtn.onclick = function() {
                _startPatchInstall();
            };
            footerArea.appendChild(installBtn);
        } else if (isPatchCompleted) {
            const okBtn = document.createElement('button');
            okBtn.textContent = '完成';
            okBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 4px;
                transition: background 0.15s ease;
            `;
            okBtn.onmouseenter = function() {
                okBtn.style.background = '#106ebe';
            };
            okBtn.onmouseleave = function() {
                okBtn.style.background = '#0078d4';
            };
            okBtn.onclick = function() {
                const result = {
                    action: 'done',
                    step: _currentStep,
                    totalSteps: totalSteps,
                    isLastStep: true,
                    type: _currentType,
                    patchResult: _patchState.result
                };
                _exitOverlay();
                if (_resolvePromise) {
                    _resolvePromise(result);
                    _resolvePromise = null;
                }
            };
            footerArea.appendChild(okBtn);
        } else if (isPatchFailed) {
            const retryBtn = document.createElement('button');
            retryBtn.textContent = '重试';
            retryBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: transparent;
                color: #1a1a1a;
                border: 1px solid #e5e5e5;
                border-radius: 4px;
                transition: all 0.15s ease;
            `;
            retryBtn.onmouseenter = function() {
                retryBtn.style.background = '#f5f5f5';
            };
            retryBtn.onmouseleave = function() {
                retryBtn.style.background = 'transparent';
            };
            retryBtn.onclick = function() {
                _patchState.status = 'pending';
                _patchState.progress = 0;
                _patchState.message = '';
                _renderContent();
            };
            footerArea.appendChild(retryBtn);

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '关闭';
            closeBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 4px;
                transition: background 0.15s ease;
            `;
            closeBtn.onmouseenter = function() {
                closeBtn.style.background = '#106ebe';
            };
            closeBtn.onmouseleave = function() {
                closeBtn.style.background = '#0078d4';
            };
            closeBtn.onclick = function() {
                const result = {
                    action: 'cancel',
                    step: _currentStep,
                    totalSteps: totalSteps,
                    isLastStep: true,
                    type: _currentType,
                    patchResult: null
                };
                _exitOverlay();
                if (_resolvePromise) {
                    _resolvePromise(result);
                    _resolvePromise = null;
                }
            };
            footerArea.appendChild(closeBtn);
        } else if (isPatchWithUrl && (_patchState.status === 'downloading' || _patchState.status === 'extracting' || _patchState.status === 'installing')) {
        } else if (isLastStep) {
            if (showCancel) {
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = buttonLabels.cancel;
                cancelBtn.style.cssText = `
                    padding: 8px 20px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    background: transparent;
                    color: #1a1a1a;
                    border: 1px solid #e5e5e5;
                    border-radius: 4px;
                    transition: all 0.15s ease;
                `;
                cancelBtn.onmouseenter = function() {
                    cancelBtn.style.background = '#f5f5f5';
                };
                cancelBtn.onmouseleave = function() {
                    cancelBtn.style.background = 'transparent';
                };
                cancelBtn.onclick = function() {
                    _exitOverlay();
                };
                footerArea.appendChild(cancelBtn);
            }

            const doneBtn = document.createElement('button');
            doneBtn.textContent = buttonLabels.done;
            doneBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 4px;
                transition: background 0.15s ease;
            `;
            doneBtn.onmouseenter = function() {
                doneBtn.style.background = '#106ebe';
            };
            doneBtn.onmouseleave = function() {
                doneBtn.style.background = '#0078d4';
            };
            doneBtn.onclick = function() {
                _handleAction(true);
            };
            footerArea.appendChild(doneBtn);
        } else {
            if (showCancel) {
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = buttonLabels.cancel;
                cancelBtn.style.cssText = `
                    padding: 8px 20px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    background: transparent;
                    color: #1a1a1a;
                    border: 1px solid #e5e5e5;
                    border-radius: 4px;
                    transition: all 0.15s ease;
                `;
                cancelBtn.onmouseenter = function() {
                    cancelBtn.style.background = '#f5f5f5';
                };
                cancelBtn.onmouseleave = function() {
                    cancelBtn.style.background = 'transparent';
                };
                cancelBtn.onclick = function() {
                    _exitOverlay();
                };
                footerArea.appendChild(cancelBtn);
            }

            const nextBtn = document.createElement('button');
            nextBtn.textContent = buttonLabels.next;
            nextBtn.style.cssText = `
                padding: 8px 20px;
                font-size: 14px;
                font-weight: 500;
                min-width: 120px;
                cursor: pointer;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 4px;
                transition: background 0.15s ease;
            `;
            nextBtn.onmouseenter = function() {
                nextBtn.style.background = '#106ebe';
            };
            nextBtn.onmouseleave = function() {
                nextBtn.style.background = '#0078d4';
            };
            nextBtn.onclick = function() {
                _handleAction(false);
            };
            footerArea.appendChild(nextBtn);
        }

        container.appendChild(footerArea);
        _overlayContainer.appendChild(container);
    }

    var SystemExpansion = {
        /**
         * 进入全屏覆盖模式
         * @param {string} type 类型：SystemProtocol | SystemPatch | SystemConfiguration
         * @param {*} assets 渲染内容（string/object/function）
         * @param {Object} meta 元数据
         *   - title: 标题 (String)
         *   - step: 步骤总数 (Number)
         *   - check: 检查数组 (Array<Object>) - 仅 SystemConfiguration 有效
         *   - patchUrl: 补丁下载地址 (String) - 仅 SystemPatch 有效
         *   - patchDescription: 补丁描述 (String) - 必填，仅 SystemPatch 有效
         *   - patchVersion: 补丁版本 (String) - 默认 1.0.0
         * @returns {Promise<Object>} 用户操作后的结果
         *   - action: 'next' | 'done' | 'cancel'
         *   - step: 当前步骤
         *   - totalSteps: 总步骤数
         *   - isLastStep: 是否最后一步
         *   - type: 类型
         *   - data: 表单数据（仅 SystemConfiguration）
         *   - patchResult: 补丁结果（仅 SystemPatch with patchUrl）
         */
        enterOverlay: function(type, assets, meta) {
            return new Promise(function(resolve, reject) {
                try {
                    if (!_checkCaller()) {
                        resolve({ success: false, message: '非法的调用来源，仅允许 D/server 目录下的已注册服务调用' });
                        return;
                    }

                    if (typeof type !== 'string' || !VALID_TYPES.includes(type)) {
                        resolve({ success: false, message: '无效的type参数' });
                        return;
                    }

                    if (_isActive) {
                        resolve({ success: false, message: '覆盖层已激活' });
                        return;
                    }

                    if (type === 'SystemPatch' && meta && meta.patchUrl) {
                        if (!meta.patchDescription) {
                            resolve({ success: false, message: 'SystemPatch 模式需要提供 patchDescription（补丁描述）' });
                            return;
                        }
                        _patchState = {
                            url: meta.patchUrl,
                            description: meta.patchDescription,
                            version: meta.patchVersion || '1.0.0',
                            status: 'pending',
                            progress: 0,
                            message: '',
                            result: null
                        };
                    } else {
                        _patchState = {
                            url: null,
                            description: null,
                            version: null,
                            status: 'pending',
                            progress: 0,
                            message: '',
                            result: null
                        };
                    }

                    _currentType = type;
                    _currentAssets = assets;
                    _currentMeta = meta || {};
                    _currentStep = 1;
                    _resolvePromise = resolve;
                    _clearErrorMessage();

                    _createOverlayContainer();
                    _renderContent();

                    _overlayContainer.style.display = 'flex';
                    _disableInputs();
                    _isActive = true;

                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("SystemExpansion", `进入覆盖模式: ${type}`);
                    }

                    resolve({ success: true, message: '等待用户操作...' });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("SystemExpansion", `进入覆盖模式失败: ${e.message}`);
                    }
                    resolve({ success: false, message: e.message });
                }
            });
        },

        /**
         * 初始化扩展
         * @returns {Promise<void>}
         */
        init: function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("SystemExpansion", "初始化完成");
            }
            return Promise.resolve();
        }
    };

    SystemExpansion._ready = SystemExpansion.init();

    if (typeof window !== 'undefined') {
        window.SystemExpansion = SystemExpansion;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.SystemExpansion = SystemExpansion;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "SystemExpansion", SystemExpansion);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("SystemExpansion", "注册到 POOL 失败: " + (e && e.message));
            }
        }
    }

    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../system/expansion/systemExpansion.js");
    }
})();
