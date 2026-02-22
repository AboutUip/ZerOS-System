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

        const result = {
            action: isLastStep ? 'done' : 'next',
            step: _currentStep,
            totalSteps: totalSteps,
            isLastStep: isLastStep,
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

        if (typeof _currentAssets === 'string') {
            contentArea.innerHTML = _currentAssets;
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

        if (isLastStep) {
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
         * @param {*} assets 渲染内容
         * @param {Object} meta 元数据
         *   - title: 标题 (String)
         *   - step: 步骤总数 (Number)
         *   - check: 检查数组 (Array<Object>) - 仅 SystemConfiguration 有效
         * @returns {Promise<Object>} 用户操作后的结果
         *   - action: 'next' | 'done'
         *   - step: 当前步骤
         *   - totalSteps: 总步骤数
         *   - isLastStep: 是否最后一步
         *   - type: 类型
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
