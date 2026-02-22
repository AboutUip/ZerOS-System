// ZerOS 星火AI聊天程序
// 支持语音输入和文本输入，AI语音回复
// 依赖 SpeechDrive（语音识别）、howler（音频播放）、NetworkManager（网络请求）
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const SPARKAI = {
        pid: null,
        window: null,
        windowId: null,
        
        // 状态管理
        isListening: false,
        isProcessing: false,
        currentSound: null,  // Howl 实例
        messages: [],  // 聊天消息列表
        speechSessionCreated: false,  // 语音识别会话是否已创建
        
        // UI元素引用
        messagesContainer: null,
        inputTextarea: null,
        voiceBtn: null,
        sendBtn: null,
        voiceToggleBtn: null,
        toolbar: null,
        
        // 事件处理器
        _eventHandlers: [],

        /**
         * 获取当前语言下的本地化文本
         */
        _getText: function(key, fallback) {
            if (!key) return (fallback != null ? fallback : '');
            try {
                const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (LanguagesExpansion && typeof LanguagesExpansion.getText === 'function') {
                    const value = LanguagesExpansion.getText(key);
                    if (value && value !== key) return value;
                }
            } catch (e) {}
            return (fallback != null ? fallback : '');
        },
        
        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            try {
                this.pid = pid;
                
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'sparkai-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 设置窗口样式
                if (typeof GUIManager === 'undefined') {
                    this.window.style.cssText = `
                        width: 800px;
                        height: 600px;
                        display: flex;
                        flex-direction: column;
                        background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: var(--style-window-border-radius, 12px);
                        box-shadow: var(--style-window-box-shadow-focused, 0 12px 40px rgba(0, 0, 0, 0.5));
                        backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
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
                        icon = ApplicationAssetManager.getIcon('sparkai');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: this._getText('SPARKAI_TITLE', '星火AI'),
                        icon: icon,
                        onClose: () => {
                            // 窗口关闭由 GUIManager 统一处理
                        }
                    });
                    
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                // 创建界面
                this._createUI();
                
                // 绑定事件
                this._bindEvents();
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 延迟初始化语音识别，确保进程已完全注册
                // 使用 setTimeout 确保 ProcessManager 已经完成进程注册
                setTimeout(async () => {
                    try {
                        await this._initSpeechRecognition();
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `延迟初始化语音识别失败: ${error.message}`);
                        }
                    }
                }, 100);
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `初始化失败: ${error.message}`, error);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SparkAI', '初始化失败', error);
                    }
                }
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                throw error;
            }
        },
        
        /**
         * 创建界面
         */
        _createUI: function() {
            // 主内容区域
            const content = document.createElement('div');
            content.className = 'sparkai-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                background: var(--theme-background, rgba(26, 31, 46, 0.95));
            `;
            content.dataset.pid = this.pid.toString();
            
            // 工具栏（固定高度）
            this.toolbar = document.createElement('div');
            this.toolbar.className = 'sparkai-toolbar';
            this.toolbar.style.cssText = `
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.2));
                flex-shrink: 0;
            `;
            this.toolbar.dataset.pid = this.pid.toString();
            
            // 标题
            const title = document.createElement('div');
            title.className = 'sparkai-title';
            title.dataset.pid = this.pid.toString();
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: var(--theme-text, #d7e0dd);
            `;
            title.textContent = this._getText('SPARKAI_TITLE', '星火AI');
            this.toolbar.appendChild(title);
            
            // 语音开关按钮
            this.voiceToggleBtn = document.createElement('button');
            this.voiceToggleBtn.className = 'sparkai-voice-toggle';
            this.voiceToggleBtn.dataset.pid = this.pid.toString();
            this.voiceToggleBtn.style.cssText = `
                padding: 6px 12px;
                background: var(--theme-primary, #8b5cf6);
                color: var(--theme-text-on-primary, #ffffff);
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            `;
            this.voiceToggleBtn.textContent = this._getText('SPARKAI_VOICE_ON', '语音回复: 开启');
            this.voiceToggleBtn.dataset.enabled = 'true';
            this.toolbar.appendChild(this.voiceToggleBtn);
            
            content.appendChild(this.toolbar);
            
            // 消息容器
            this.messagesContainer = document.createElement('div');
            this.messagesContainer.className = 'sparkai-messages';
            this.messagesContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            `;
            this.messagesContainer.dataset.pid = this.pid.toString();
            content.appendChild(this.messagesContainer);
            
            // 输入区域
            const inputArea = document.createElement('div');
            inputArea.className = 'sparkai-input-area';
            inputArea.style.cssText = `
                padding: 12px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                border-top: 1px solid var(--theme-border, rgba(139, 92, 246, 0.2));
                display: flex;
                gap: 8px;
                align-items: flex-end;
                flex-shrink: 0;
            `;
            inputArea.dataset.pid = this.pid.toString();
            
            // 语音输入按钮
            this.voiceBtn = document.createElement('button');
            this.voiceBtn.className = 'sparkai-voice-btn';
            this.voiceBtn.dataset.pid = this.pid.toString();
            this.voiceBtn.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: none;
                background: var(--theme-background-secondary, rgba(20, 25, 40, 0.5));
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                transition: all 0.2s;
                flex-shrink: 0;
            `;
            this.voiceBtn.innerHTML = '🎤';
            this.voiceBtn.title = '语音输入';
            inputArea.appendChild(this.voiceBtn);
            
            // 文本输入框
            this.inputTextarea = document.createElement('textarea');
            this.inputTextarea.className = 'sparkai-input';
            this.inputTextarea.dataset.pid = this.pid.toString();
            this.inputTextarea.style.cssText = `
                flex: 1;
                min-height: 40px;
                max-height: 120px;
                padding: 10px 12px;
                background: var(--theme-background-secondary, rgba(20, 25, 40, 0.5));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.2));
                border-radius: 8px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                font-family: inherit;
                resize: none;
                outline: none;
            `;
            this.inputTextarea.placeholder = this._getText('SPARKAI_INPUT_PLACEHOLDER', '输入消息或点击麦克风进行语音输入...');
            inputArea.appendChild(this.inputTextarea);
            
            // 发送按钮
            this.sendBtn = document.createElement('button');
            this.sendBtn.className = 'sparkai-send-btn';
            this.sendBtn.dataset.pid = this.pid.toString();
            this.sendBtn.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: none;
                background: var(--theme-primary, #8b5cf6);
                color: var(--theme-text-on-primary, #ffffff);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                transition: all 0.2s;
                flex-shrink: 0;
            `;
            this.sendBtn.innerHTML = '➤';
            this.sendBtn.title = '发送';
            inputArea.appendChild(this.sendBtn);
            
            content.appendChild(inputArea);
            this.window.appendChild(content);
        },
        
        /**
         * 绑定事件
         */
        _bindEvents: function() {
            // 发送按钮点击
            const sendHandler = () => {
                this._sendMessage();
            };
            this.sendBtn.addEventListener('click', sendHandler);
            this._eventHandlers.push({ element: this.sendBtn, event: 'click', handler: sendHandler });
            
            // 回车发送（Shift+Enter换行）
            const textareaKeyHandler = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._sendMessage();
                } else {
                    // 自动调整高度
                    this._adjustTextareaHeight();
                }
            };
            this.inputTextarea.addEventListener('keydown', textareaKeyHandler);
            this._eventHandlers.push({ element: this.inputTextarea, event: 'keydown', handler: textareaKeyHandler });
            
            // 输入时自动调整高度
            const textareaInputHandler = () => {
                this._adjustTextareaHeight();
            };
            this.inputTextarea.addEventListener('input', textareaInputHandler);
            this._eventHandlers.push({ element: this.inputTextarea, event: 'input', handler: textareaInputHandler });
            
            // 语音按钮点击
            const voiceHandler = () => {
                this._toggleVoiceInput();
            };
            this.voiceBtn.addEventListener('click', voiceHandler);
            this._eventHandlers.push({ element: this.voiceBtn, event: 'click', handler: voiceHandler });
            
            // 语音回复开关
            const voiceToggleHandler = () => {
                const enabled = this.voiceToggleBtn.dataset.enabled === 'true';
                this.voiceToggleBtn.dataset.enabled = enabled ? 'false' : 'true';
                const voiceText = enabled ? this._getText('SPARKAI_VOICE_OFF', '语音回复: 关闭') : this._getText('SPARKAI_VOICE_ON', '语音回复: 开启');
                this.voiceToggleBtn.textContent = voiceText;
            };
            this.voiceToggleBtn.addEventListener('click', voiceToggleHandler);
            this._eventHandlers.push({ element: this.voiceToggleBtn, event: 'click', handler: voiceToggleHandler });
        },
        
        /**
         * 初始化语音识别
         */
        _initSpeechRecognition: async function() {
            const maxRetries = 5;  // 最大重试次数
            const retryDelay = 200;  // 每次重试间隔（毫秒）
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // 检查 ProcessManager 是否可用
                    if (typeof ProcessManager === 'undefined') {
                        this.voiceBtn.disabled = true;
                        this.voiceBtn.title = 'ProcessManager 不可用';
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', 'ProcessManager 不可用');
                        }
                        return;
                    }
                    
                    // 检查进程是否已注册（通过尝试调用一个简单的 API）
                    try {
                        // 检查支持
                        const supported = await ProcessManager.callKernelAPI(this.pid, 'Speech.isSupported');
                        if (!supported) {
                            this.voiceBtn.disabled = true;
                            this.voiceBtn.title = '浏览器不支持语音识别';
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('SparkAI', '浏览器不支持语音识别');
                            }
                            return;
                        }
                    } catch (error) {
                        // 如果进程未注册，重试
                        if (error.message && error.message.includes('not running')) {
                            if (attempt < maxRetries) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('SparkAI', `进程未注册，等待重试 (${attempt}/${maxRetries})...`);
                                }
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                                continue;
                            } else {
                                throw new Error('进程注册超时，请稍后重试');
                            }
                        }
                        throw error;
                    }
                    
                    // 创建识别会话
                    await ProcessManager.callKernelAPI(this.pid, 'Speech.createSession', [{
                        language: 'zh-CN',
                        continuous: false,
                        interimResults: true,
                        onResult: (text, isFinal) => {
                            if (isFinal) {
                                // 最终结果，自动发送
                                this.inputTextarea.value = text;
                                if (this._adjustTextareaHeight) {
                                    this._adjustTextareaHeight();
                                }
                                this._sendMessage();
                            } else {
                                // 临时结果，显示在输入框
                                this.inputTextarea.value = text;
                                if (this._adjustTextareaHeight) {
                                    this._adjustTextareaHeight();
                                }
                            }
                        },
                        onError: (error) => {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('SparkAI', `语音识别错误: ${error.message}`);
                            }
                            this._addSystemMessage('语音识别出错: ' + error.message);
                            this._stopVoiceInput();
                        }
                    }]);
                    
                    // 标记会话已创建
                    this.speechSessionCreated = true;
                    
                    // 成功，退出重试循环
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SparkAI', '语音识别初始化成功');
                    }
                    return;
                    
                } catch (error) {
                    // 如果是最后一次尝试，抛出错误
                    if (attempt === maxRetries) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('SparkAI', `初始化语音识别失败 (${maxRetries} 次尝试): ${error.message}`, error);
                        }
                        this.voiceBtn.disabled = true;
                        this.voiceBtn.title = '语音识别初始化失败: ' + error.message;
                        return;
                    }
                    
                    // 否则等待后重试
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SparkAI', `初始化语音识别失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，等待重试...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        },
        
        /**
         * 切换语音输入
         */
        _toggleVoiceInput: async function() {
            if (this.isListening) {
                await this._stopVoiceInput();
            } else {
                await this._startVoiceInput();
            }
        },
        
        /**
         * 开始语音输入
         */
        _startVoiceInput: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 不可用');
                }
                
                // 如果会话未创建，先创建会话
                if (!this.speechSessionCreated) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SparkAI', '会话未创建，正在创建...');
                    }
                    await this._ensureSpeechSession();
                }
                
                // 检查会话状态
                try {
                    const status = await ProcessManager.callKernelAPI(this.pid, 'Speech.getSessionStatus');
                    if (!status || !status.exists) {
                        // 会话不存在，重新创建
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', '会话不存在，重新创建...');
                        }
                        await this._ensureSpeechSession();
                    }
                } catch (error) {
                    // 如果检查失败，尝试重新创建会话
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SparkAI', `检查会话状态失败: ${error.message}，尝试重新创建...`);
                    }
                    await this._ensureSpeechSession();
                }
                
                // 启动识别
                await ProcessManager.callKernelAPI(this.pid, 'Speech.startRecognition');
                this.isListening = true;
                this.voiceBtn.style.background = 'var(--theme-primary, #8b5cf6)';
                this.voiceBtn.style.animation = 'pulse 1.5s ease-in-out infinite';
                this.inputTextarea.placeholder = this._getText('SPARKAI_LISTENING', '正在聆听...');
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `启动语音识别失败: ${error.message}`);
                }
                this._addSystemMessage('启动语音识别失败: ' + error.message);
            }
        },
        
        /**
         * 确保语音识别会话已创建
         */
        _ensureSpeechSession: async function() {
            try {
                // 检查支持
                const supported = await ProcessManager.callKernelAPI(this.pid, 'Speech.isSupported');
                if (!supported) {
                    throw new Error('浏览器不支持语音识别');
                }
                
                // 创建识别会话
                await ProcessManager.callKernelAPI(this.pid, 'Speech.createSession', [{
                    language: 'zh-CN',
                    continuous: false,
                    interimResults: true,
                    onResult: (text, isFinal) => {
                        if (isFinal) {
                            // 最终结果，自动发送
                            this.inputTextarea.value = text;
                            if (this._adjustTextareaHeight) {
                                this._adjustTextareaHeight();
                            }
                            this._sendMessage();
                        } else {
                            // 临时结果，显示在输入框
                            this.inputTextarea.value = text;
                            if (this._adjustTextareaHeight) {
                                this._adjustTextareaHeight();
                            }
                        }
                    },
                    onError: (error) => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('SparkAI', `语音识别错误: ${error.message}`);
                        }
                        this._addSystemMessage('语音识别出错: ' + error.message);
                        this._stopVoiceInput();
                    }
                }]);
                
                // 标记会话已创建
                this.speechSessionCreated = true;
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SparkAI', '语音识别会话已创建');
                }
            } catch (error) {
                this.speechSessionCreated = false;
                throw error;
            }
        },
        
        /**
         * 停止语音输入
         */
        _stopVoiceInput: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    return;
                }
                await ProcessManager.callKernelAPI(this.pid, 'Speech.stopRecognition');
                this.isListening = false;
                this.voiceBtn.style.background = 'var(--theme-background-secondary, rgba(20, 25, 40, 0.5))';
                this.voiceBtn.style.animation = 'none';
                this.inputTextarea.placeholder = this._getText('SPARKAI_INPUT_PLACEHOLDER', '输入消息或点击麦克风进行语音输入...');
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `停止语音识别失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 发送消息
         */
        _sendMessage: async function() {
            const text = this.inputTextarea.value.trim();
            if (!text || this.isProcessing) {
                return;
            }
            
            // 清空输入框并重置高度
            this.inputTextarea.value = '';
            if (this._adjustTextareaHeight) {
                this._adjustTextareaHeight();
            }
            
            // 添加用户消息
            this._addMessage('user', text);
            
            // 停止语音输入
            if (this.isListening) {
                await this._stopVoiceInput();
            }
            
            // 发送到AI
            this.isProcessing = true;
            this.sendBtn.disabled = true;
            this.sendBtn.innerHTML = '⏳';
            
            try {
                await this._callAI(text);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `AI调用失败: ${error.message}`, error);
                }
                this._addSystemMessage('AI调用失败: ' + error.message);
            } finally {
                this.isProcessing = false;
                this.sendBtn.disabled = false;
                this.sendBtn.innerHTML = '➤';
            }
        },
        
        /**
         * 调用AI接口
         */
        _callAI: async function(text) {
            try {
                // 调用AI接口
                const url = `https://api-v1.cenguigui.cn/api/chat/?msg=${encodeURIComponent(text)}`;
                
                // 使用 fetch 发送请求（NetworkManager 会自动拦截）
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.code !== 200) {
                    throw new Error(data.msg || 'AI响应错误');
                }
                
                if (!data.data || !data.data.content) {
                    throw new Error('AI响应格式错误：缺少 content 字段');
                }
                
                const aiResponse = data.data.content;
                
                // 添加AI消息
                this._addMessage('ai', aiResponse);
                
                // 如果开启了语音回复，播放语音
                if (this.voiceToggleBtn && this.voiceToggleBtn.dataset.enabled === 'true') {
                    await this._playVoiceResponse(aiResponse);
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `AI调用失败: ${error.message}`, error);
                }
                throw error;
            }
        },
        
        /**
         * 播放语音回复
         */
        _playVoiceResponse: async function(text) {
            let audioUrl = null;  // 在外部声明，以便在 catch 块中使用
            
            try {
                // 调用TTS接口
                const url = `https://api-v1.cenguigui.cn/api/speech/AiChat/?text=${encodeURIComponent(text)}&voice=译制腔&module=audio`;
                
                // 如果 data 为 null 但存在 task_id，说明音频正在生成，需要轮询获取
                audioUrl = await this._fetchAudioUrl(url, text);
                
                // 使用 PHP 代理服务绕过 CORS 限制
                audioUrl = this._getProxiedAudioUrl(audioUrl);
                
                // 加载howler库
                let Howl = null;
                if (typeof DynamicManager !== 'undefined' && DynamicManager.loadModule) {
                    Howl = await DynamicManager.loadModule('howler', {
                        force: false,
                        checkDependencies: true
                    });
                } else if (typeof window !== 'undefined' && typeof window.Howl !== 'undefined') {
                    Howl = window.Howl;
                } else if (typeof globalThis !== 'undefined' && typeof globalThis.Howl !== 'undefined') {
                    Howl = globalThis.Howl;
                }
                
                if (!Howl) {
                    throw new Error('Howler 库加载失败');
                }
                
                // 停止之前的音频
                if (this.currentSound) {
                    try {
                        if (typeof this.currentSound.stop === 'function') {
                            this.currentSound.stop();
                        } else if (this.currentSound.pause) {
                            this.currentSound.pause();
                            this.currentSound.currentTime = 0;
                        }
                    } catch (e) {
                        // 忽略停止错误
                    }
                    this.currentSound = null;
                }
                
                // 播放新音频
                // 使用 HTML5 Audio API，它对跨域音频资源有更好的支持
                // 浏览器会自动处理 CORS，只要服务器允许跨域访问
                this.currentSound = new Howl({
                    src: [audioUrl],
                    format: ['wav'],
                    autoplay: true,
                    html5: true,  // 使用 HTML5 Audio API（更好的跨域支持）
                    xhr: {
                        withCredentials: false,  // 不发送凭证，避免 CORS 问题
                        headers: {}  // 不添加自定义头部，避免 CORS 预检请求
                    },
                    onload: () => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('SparkAI', '音频加载成功');
                        }
                    },
                    onloaderror: (id, error) => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `音频加载失败 (ID: ${id}): ${error || '未知错误'}`);
                        }
                        // 如果 howler.js 加载失败，尝试使用原生 HTML5 Audio 作为降级方案
                        this._playAudioFallback(audioUrl);
                        this.currentSound = null;
                    },
                    onend: () => {
                        this.currentSound = null;
                    },
                    onerror: (id, error) => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('SparkAI', `音频播放失败 (ID: ${id}): ${error || '未知错误'}`);
                        }
                        // 如果 howler.js 播放失败，尝试使用原生 HTML5 Audio 作为降级方案
                        this._playAudioFallback(audioUrl);
                        this.currentSound = null;
                    }
                });
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `播放语音回复失败: ${error.message}`, error);
                }
                // 如果 howler.js 完全失败，且已获取到 audioUrl，尝试使用原生 HTML5 Audio 作为降级方案
                if (audioUrl) {
                    try {
                        this._playAudioFallback(audioUrl);
                    } catch (fallbackError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `降级方案也失败: ${fallbackError.message}`);
                        }
                    }
                }
            }
        },
        
        /**
         * 获取音频 URL（支持轮询）
         */
        _fetchAudioUrl: async function(url, text) {
            const maxRetries = 10;  // 最大重试次数
            const retryDelay = 2000;  // 每次重试间隔（毫秒）
            const timeout = 30000;  // 总超时时间（毫秒）
            
            const startTime = Date.now();
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                // 检查是否超时
                if (Date.now() - startTime > timeout) {
                    throw new Error(`获取音频 URL 超时：超过 ${timeout / 1000} 秒`);
                }
                
                try {
                    // 等待一段时间后重试（第一次立即尝试）
                    if (attempt > 1) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SparkAI', `获取音频 URL (尝试 ${attempt}/${maxRetries})`);
                    }
                    
                    // 使用 fetch 发送请求（NetworkManager 会自动拦截）
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.code !== 200) {
                        throw new Error(data.message || 'TTS响应错误');
                    }
                    
                    // 如果 data 存在且包含 audio_url，返回它
                    if (data.data && data.data.audio_url) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('SparkAI', `成功获取音频 URL`);
                        }
                        return data.data.audio_url;
                    }
                    
                    // 如果 data 为 null 但存在 task_id，说明音频正在生成，继续轮询
                    if (data.task_id) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('SparkAI', `音频正在生成中 (task_id: ${data.task_id})，继续等待...`);
                        }
                        // 继续下一次循环
                        continue;
                    }
                    
                    // 如果既没有 audio_url 也没有 task_id，抛出错误
                    throw new Error('TTS响应格式错误：缺少 audio_url 字段和 task_id');
                    
                } catch (error) {
                    // 如果是最后一次尝试，抛出错误
                    if (attempt === maxRetries) {
                        throw new Error(`获取音频 URL 失败：${error.message}`);
                    }
                    // 否则记录警告并继续
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SparkAI', `尝试 ${attempt} 失败: ${error.message}，继续重试...`);
                    }
                }
            }
            
            // 如果所有重试都失败
            throw new Error(`获取音频 URL 失败：经过 ${maxRetries} 次尝试后仍未获取到音频 URL`);
        },
        
        /**
         * 获取代理音频 URL（绕过 CORS 限制）
         */
        _getProxiedAudioUrl: function(originalUrl) {
            try {
                // 如果是本地 URL 或 data URL，直接返回
                if (originalUrl.startsWith('data:') || 
                    originalUrl.startsWith('/') || 
                    originalUrl.startsWith('http://localhost') ||
                    originalUrl.startsWith('http://127.0.0.1')) {
                    return originalUrl;
                }
                
                // 构建代理 URL（优先 SystemInformation 以支持多后端）
                const proxyBaseUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.getAudioProxyUrl)
                    ? SystemInformation.getAudioProxyUrl()
                    : ((typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin || '')) + ((typeof SystemInformation !== 'undefined' && SystemInformation.getAudioProxyPath) ? SystemInformation.getAudioProxyPath() : '/system/service/audio-proxy.php');
                const encodedUrl = encodeURIComponent(originalUrl);
                return `${proxyBaseUrl}${proxyBaseUrl.indexOf('?') >= 0 ? '&' : '?'}url=${encodedUrl}`;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SparkAI', `构建代理 URL 失败: ${error.message}`);
                }
                // 如果构建失败，返回原始 URL
                return originalUrl;
            }
        },
        
        /**
         * 使用原生 HTML5 Audio 播放音频（降级方案）
         */
        _playAudioFallback: function(audioUrl) {
            try {
                // 停止之前的音频
                if (this.currentSound) {
                    if (typeof this.currentSound.stop === 'function') {
                        this.currentSound.stop();
                    } else if (this.currentSound.pause) {
                        this.currentSound.pause();
                        this.currentSound.currentTime = 0;
                    }
                    this.currentSound = null;
                }
                
                // 创建原生 Audio 元素
                const audio = new Audio(audioUrl);
                audio.crossOrigin = 'anonymous';  // 允许跨域
                
                // 播放音频
                audio.play().then(() => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SparkAI', '使用原生 HTML5 Audio 播放成功');
                    }
                    
                    // 播放结束后清理
                    audio.addEventListener('ended', () => {
                        this.currentSound = null;
                    }, { once: true });
                    
                    // 保存引用以便后续停止
                    this.currentSound = audio;
                }).catch((error) => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SparkAI', `原生 HTML5 Audio 播放失败: ${error.message}`);
                    }
                    this.currentSound = null;
                });
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SparkAI', `创建原生 HTML5 Audio 失败: ${error.message}`);
                }
                this.currentSound = null;
            }
        },
        
        /**
         * 添加消息
         */
        _addMessage: function(role, content) {
            const message = document.createElement('div');
            message.className = `sparkai-message sparkai-message-${role}`;
            message.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-width: 80%;
                ${role === 'user' ? 'align-self: flex-end;' : 'align-self: flex-start;'}
            `;
            message.dataset.pid = this.pid.toString();
            
            // 消息气泡
            const bubble = document.createElement('div');
            bubble.className = `sparkai-bubble sparkai-bubble-${role}`;
            bubble.dataset.pid = this.pid.toString();
            bubble.style.cssText = `
                padding: 12px 16px;
                border-radius: 12px;
                word-wrap: break-word;
                white-space: pre-wrap;
                font-size: 14px;
                line-height: 1.5;
                ${
                    role === 'user' 
                        ? `background: var(--theme-primary, #8b5cf6);
                           color: var(--theme-text-on-primary, #ffffff);`
                        : `background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                           color: var(--theme-text, #d7e0dd);
                           border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.2));`
                }
            `;
            bubble.textContent = content;
            message.appendChild(bubble);
            
            // 时间戳
            const timestamp = document.createElement('div');
            timestamp.className = 'sparkai-timestamp';
            timestamp.dataset.pid = this.pid.toString();
            timestamp.style.cssText = `
                font-size: 11px;
                color: var(--theme-text-muted, rgba(215, 224, 221, 0.4));
                padding: 0 4px;
            `;
            timestamp.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            message.appendChild(timestamp);
            
            this.messagesContainer.appendChild(message);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            
            this.messages.push({ role, content, timestamp: Date.now() });
        },
        
        /**
         * 调整输入框高度
         */
        _adjustTextareaHeight: function() {
            if (!this.inputTextarea) {
                return;
            }
            // 重置高度以获取正确的 scrollHeight
            this.inputTextarea.style.height = 'auto';
            // 设置新高度，但不超过最大高度
            const newHeight = Math.min(this.inputTextarea.scrollHeight, 120);
            this.inputTextarea.style.height = newHeight + 'px';
        },
        
        /**
         * 添加系统消息
         */
        _addSystemMessage: function(content) {
            const message = document.createElement('div');
            message.className = 'sparkai-message sparkai-message-system';
            message.style.cssText = `
                align-self: center;
                padding: 8px 12px;
                background: var(--theme-background-secondary, rgba(20, 25, 40, 0.5));
                border-radius: 6px;
                font-size: 12px;
                color: var(--theme-text-muted, rgba(215, 224, 221, 0.6));
            `;
            message.textContent = content;
            message.dataset.pid = this.pid.toString();
            
            this.messagesContainer.appendChild(message);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: '星火AI',
                type: 'GUI',
                version: '1.0.0',
                description: '基于讯飞星火大模型的AI聊天程序，支持语音输入和语音回复',
                author: 'ZerOS',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,      // 创建GUI窗口
                    PermissionManager.PERMISSION.EVENT_LISTENER,          // 注册事件监听器
                    PermissionManager.PERMISSION.SPEECH_RECOGNITION,     // 语音识别
                    PermissionManager.PERMISSION.NETWORK_ACCESS          // 网络访问（调用AI API和TTS API）
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            try {
                // 1. 停止语音识别
                if (this.isListening && typeof ProcessManager !== 'undefined') {
                    try {
                        await ProcessManager.callKernelAPI(this.pid, 'Speech.stopSession');
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `停止语音识别失败: ${e.message}`);
                        }
                    }
                }
                
                // 2. 停止音频播放
                if (this.currentSound) {
                    try {
                        // 检查是 Howl 实例还是原生 Audio 元素
                        if (typeof this.currentSound.stop === 'function') {
                            // Howl 实例
                            this.currentSound.stop();
                        } else if (this.currentSound.pause) {
                            // 原生 Audio 元素
                            this.currentSound.pause();
                            this.currentSound.currentTime = 0;
                        }
                        this.currentSound = null;
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `停止音频播放失败: ${e.message}`);
                        }
                    }
                }
                
                // 3. 取消注册 GUI 窗口
                if (this.windowId && typeof GUIManager !== 'undefined') {
                    try {
                        await GUIManager.unregisterWindow(this.windowId);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `取消注册窗口失败: ${e.message}`);
                        }
                    }
                } else if (this.pid && typeof GUIManager !== 'undefined') {
                    try {
                        await GUIManager.unregisterWindow(this.pid);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SparkAI', `取消注册窗口失败: ${e.message}`);
                        }
                    }
                }
                
                // 4. 移除所有事件监听器
                if (this._eventHandlers && Array.isArray(this._eventHandlers)) {
                    this._eventHandlers.forEach(({ element, event, handler }) => {
                        if (element && typeof element.removeEventListener === 'function') {
                            element.removeEventListener(event, handler);
                        }
                    });
                    this._eventHandlers = [];
                }
                
                // 5. 清理 DOM 元素
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                // 6. 清理所有引用
                this.window = null;
                this.windowId = null;
                this.messagesContainer = null;
                this.inputTextarea = null;
                this.voiceBtn = null;
                this.sendBtn = null;
                this.voiceToggleBtn = null;
                this.toolbar = null;
                this.currentSound = null;
                this.messages = [];
                this._eventHandlers = null;
                this.speechSessionCreated = false;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SparkAI', `清理资源失败: ${error.message}`, error);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SparkAI', '清理资源失败', error);
                    }
                }
            }
        }
    };
    
    // 导出程序
    if (typeof window !== 'undefined') {
        window.SPARKAI = SPARKAI;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.SPARKAI = SPARKAI;
    }
    
})(window);