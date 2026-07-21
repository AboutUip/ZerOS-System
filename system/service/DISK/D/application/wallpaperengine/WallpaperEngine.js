// WallpaperEngine 壁纸引擎 - 分发版 GUI 程序
// 依赖 D/server 下的 wallpaperengine 服务（服务源码存放于 assets，由安装/运行流程部署）

(function (window) {
    'use strict';

    const PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
    const SERVICE_ID = 'wallpaperengine';
    const ASSET_SERVICE_PATH = 'D:/application/wallpaperengine/assets/server-wallpaperengine.js';
    const SERVER_TARGET_PATH = 'D:/server/server-wallpaperengine.js';
    const CACHE_WALLPAPER_DIR = 'D:/cache/wallpaper';
    const LIBRARY_REGISTRY_KEY = 'wallpaperengine.library';
    /** 壁纸库注册表格式（可扩展）：{ version: 1, items: [ { id, path, sourceFile?, name?, addedAt?, ... } ] } */

    const WALLPAPERENGINE = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,
        eventHandlers: [],
        _loadingEl: null,
        _autoStartEnabled: undefined,
        _guiContainer: null,
        _docWindow: null,
        _docWindowId: null,
        _libraryWindow: null,
        _libraryWindowId: null,

        __info__: function () {
            return {
                name: 'Wallpaper Engine',
                type: 'GUI',
                version: '1.0.0',
                description: '壁纸引擎',
                author: 'ZerOS',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.GUI_WINDOW_CREATE,
                    PM.EVENT_LISTENER,
                    PM.PROCESS_BACKGROUND,
                    PM.SERVER_SERVICE_MANAGE,
                    PM.KERNEL_DISK_READ,
                    PM.KERNEL_DISK_WRITE,
                    PM.KERNEL_DISK_CREATE,
                    PM.KERNEL_DISK_DELETE,
                    PM.KERNEL_DISK_LIST,
                    PM.SYSTEM_NOTIFICATION,
                    PM.SCHEDULE_TASK_STARTUP,
                    PM.SCHEDULE_TASK_MANAGE
                ] : [],
                metadata: {
                    allowMultipleInstances: false,
                    category: 'utility',
                    showOnDesktop: true
                }
            };
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._upid = (initArgs && initArgs.upid) != null ? initArgs.upid : null;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            // 仅当计划任务明确传 runInBackground: false（服务自启）时只起服务再退出；否则进托盘
            this._runInBackground = (initArgs && initArgs.runInBackground) !== false;
            this.eventHandlers = [];

            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WallpaperEngine', '未找到 gui-container');
                }
                return;
            }
            this._guiContainer = guiContainer;

            this.window = document.createElement('div');
            this.window.className = 'wallpaperengine-window zos-gui-window';
            this.window.dataset.pid = String(pid);
            this._buildLoadingUI();
            this.window.style.cssText = [
                'width: 240px;',
                'height: 100px;',
                'min-width: 0;',
                'min-height: 0;',
                'display: flex;',
                'flex-direction: column;',
                'overflow: hidden;'
            ].join(' ');

            if (typeof GUIManager !== 'undefined') {
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'Wallpaper Engine',
                    icon: null,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: this._loadingEl,
                    onClose: () => this._onCloseRequest()
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            guiContainer.appendChild(this.window);

            var self = this;
            var loadDelayMs = 2000 + Math.floor(Math.random() * 1000);
            setTimeout(function () {
                self._ensureServiceThenGoBackground();
            }, loadDelayMs);
        },

        _buildLoadingUI: function () {
            const wrap = document.createElement('div');
            wrap.className = 'wallpaperengine-load-wrap';
            wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;';
            const spinner = document.createElement('div');
            spinner.className = 'wallpaperengine-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            wrap.appendChild(spinner);
            const load = document.createElement('div');
            load.className = 'wallpaperengine-load';
            load.textContent = 'Load';
            load.style.cssText = 'font-size:14px;color:var(--theme-text-secondary,#a0aec0);';
            wrap.appendChild(load);
            this.window.appendChild(wrap);
            this._loadingEl = wrap;
        },

        _ensureServiceThenGoBackground: function () {
            var self = this;
            if (this._runInBackground) {
                // 启动时不拉起服务：服务由系统自启或用户通过右击菜单「重启服务」等操作时再检查/拉起
                self._goToBackground();
            } else {
                this._ensureServiceRunning().then(function () {
                    if (self._kernelAPI && typeof self._kernelAPI.call === 'function') {
                        self._kernelAPI.call('Process.requestSelfTermination', []).catch(function () {});
                    }
                }).catch(function () {
                    if (self._kernelAPI && typeof self._kernelAPI.call === 'function') {
                        self._kernelAPI.call('Process.requestSelfTermination', []).catch(function () {});
                    }
                });
            }
        },

        _ensureServiceRunning: function () {
            var self = this;
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') return Promise.resolve(false);
            return api.call('Server.listServices', [])
                .then(function (ids) {
                    if (!Array.isArray(ids)) ids = [];
                    if (ids.indexOf(SERVICE_ID) < 0) {
                        return self._installService().then(function (ok) {
                            if (!ok) return Promise.reject(new Error('安装服务失败'));
                            return api.call('Server.loadAll', []);
                        });
                    }
                    return Promise.resolve();
                })
                .then(function () {
                    return api.call('Server.isStarted', [SERVICE_ID]);
                })
                .then(function (started) {
                    if (started) return Promise.resolve(true);
                    return api.call('Server.start', [SERVICE_ID]).then(function () { return true; });
                })
                .catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('WallpaperEngine', '_ensureServiceRunning: ' + (e && e.message));
                    }
                    return false;
                });
        },

        _installService: function () {
            const self = this;
            return new Promise(function (resolve) {
                const url = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function')
                    ? ProcessManager.convertVirtualPathToUrl(ASSET_SERVICE_PATH)
                    : null;
                if (!url) {
                    resolve(false);
                    return;
                }
                fetch(url)
                    .then(function (r) { return r.text(); })
                    .then(function (content) {
                        if (!content || content.length < 10) {
                            resolve(false);
                            return;
                        }
                        if (!self._kernelAPI || typeof self._kernelAPI.call !== 'function') {
                            resolve(false);
                            return;
                        }
                        return self._kernelAPI.call('FileSystem.write', [SERVER_TARGET_PATH, content, 'OVERWRITE'])
                            .then(function () { resolve(true); })
                            .catch(function (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('WallpaperEngine', 'FileSystem.write 安装服务: ' + (e && e.message));
                                }
                                resolve(false);
                            });
                    })
                    .catch(function (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('WallpaperEngine', 'fetch 服务脚本: ' + (e && e.message));
                        }
                        resolve(false);
                    });
            });
        },

        _restartService: function () {
            var self = this;
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') {
                api && api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '无法重启：无内核 API' }]).catch(function () {});
                return;
            }
            api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '正在重启服务…' }]).catch(function () {});
            api.call('Server.listServices', [])
                .then(function (ids) {
                    if (!Array.isArray(ids)) ids = [];
                    var exists = ids.indexOf(SERVICE_ID) >= 0;
                    if (exists) {
                        return api.call('Server.stop', [SERVICE_ID]).then(function () { return true; });
                    }
                    return Promise.resolve(true);
                })
                .then(function () {
                    return api.call('FileSystem.delete', [SERVER_TARGET_PATH]).catch(function () {});
                })
                .then(function () {
                    return self._installService();
                })
                .then(function (installed) {
                    if (!installed) {
                        return Promise.reject(new Error('重新安装服务失败'));
                    }
                    return api.call('Server.loadAll', []);
                })
                .then(function () {
                    return api.call('Server.start', [SERVICE_ID]);
                })
                .then(function () {
                    api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '服务已重启' }]).catch(function () {});
                })
                .catch(function (e) {
                    var msg = e && e.message ? e.message : String(e);
                    api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '重启失败: ' + msg }]).catch(function () {});
                });
        },

        _goToBackground: function () {
            if (this._loadingEl && this._loadingEl.parentNode) {
                this._loadingEl.parentNode.removeChild(this._loadingEl);
            }
            this._loadingEl = null;
            this._buildTrayPanel();
            if (this.window && this.window.style) {
                this.window.style.display = 'none';
            }
            const api = this._kernelAPI;
            if (api && typeof api.call === 'function') {
                api.call('Process.requestBackground', []).catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('WallpaperEngine', 'requestBackground 失败: ' + (e && e.message));
                    }
                });
            }
            var self = this;
            setTimeout(function () { self._registerBackgroundTray(); }, 0);
            self._getLibraryRegistry().then(function (reg) {
                if (!reg.enabledId) return;
                var api = self._kernelAPI;
                if (!api || typeof api.call !== 'function') return;
                var enabledId = reg.enabledId;
                self._ensureWallpaperCacheDir().then(function () {
                    return api.call('FileSystem.list', [CACHE_WALLPAPER_DIR]);
                }).then(function (list) {
                    var dirs = (list && list.directories) ? list.directories : [];
                    var validIds = dirs.map(function (d) { return (d.name != null ? d.name : d.fileName) || ''; }).filter(Boolean);
                    if (validIds.indexOf(enabledId) < 0) {
                        reg.enabledId = null;
                        self._setLibraryRegistry(reg).catch(function () {});
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-clear'));
                        }
                        return;
                    }
                    self._ensureServiceRunning().then(function () {
                        self._applyWallpaperById(enabledId);
                    }).catch(function () {});
                }).catch(function () {
                    self._ensureServiceRunning().then(function () {
                        self._applyWallpaperById(enabledId);
                    }).catch(function () {});
                });
            }).catch(function () {});
        },

        _buildTrayPanel: function () {
            var self = this;
            var panel = document.createElement('div');
            panel.className = 'wallpaperengine-tray-panel';
            panel.style.cssText = 'padding:16px;text-align:center;';
            var tip = document.createElement('div');
            tip.style.cssText = 'font-size:13px;color:var(--theme-text-secondary,#a0aec0);margin-bottom:12px;';
            tip.textContent = '壁纸引擎正在后台运行';
            panel.appendChild(tip);
            var exitBtn = document.createElement('button');
            exitBtn.className = 'wallpaperengine-btn';
            exitBtn.textContent = '退出';
            exitBtn.dataset.action = 'exit';
            panel.appendChild(exitBtn);
            this.window.appendChild(panel);
            this._trayPanel = panel;
            if (typeof EventManager !== 'undefined' && this.pid && exitBtn) {
                var id = EventManager.registerElementEvent(this.pid, exitBtn, 'click', function () {
                    if (self._kernelAPI && typeof self._kernelAPI.call === 'function') {
                        self._kernelAPI.call('Process.requestSelfTermination', []).catch(function () {});
                    }
                });
                this.eventHandlers.push(id);
            }
        },

        _registerBackgroundTray: function () {
            var api = this._kernelAPI;
            var win = this.window;
            var windowId = this.windowId;
            if (!api || typeof api.call !== 'function') return;
            api.call('Process.registerBackgroundTrayClick', [
                function () {
                    var run = function () {
                        if (win && win.style) win.style.display = 'none';
                        if (typeof GUIManager !== 'undefined' && windowId) {
                            var winInfo = GUIManager.getWindowInfo(windowId);
                            if (winInfo && winInfo.window && winInfo.window.style) winInfo.window.style.display = 'none';
                        }
                    };
                    setTimeout(run, 0);
                }
            ]).catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WallpaperEngine', 'registerBackgroundTrayClick 失败: ' + (e && e.message));
                }
            });
            api.call('Process.registerBackgroundTrayContextMenu', [
                function () {
                    var enabled = WALLPAPERENGINE._autoStartEnabled;
                    var label = enabled === true ? '\u2713 程序自启：已启用' : (enabled === false ? '\u25CB 程序自启：已禁用' : '程序自启');
                    return [
                        {
                            label: label,
                            onClick: function () {
                                var api = WALLPAPERENGINE._kernelAPI;
                                if (!api || typeof api.call !== 'function') return;
                                // 乐观更新：点击时立即更新状态，下次打开菜单即可显示正确（否则要等异步完成才更新，菜单会一直显示旧状态）
                                if (enabled === true) {
                                    WALLPAPERENGINE._autoStartEnabled = false;
                                } else {
                                    WALLPAPERENGINE._autoStartEnabled = true;
                                }
                                (function run() {
                                    api.call('ScheduleTask.getAll', []).then(function (list) {
                                        if (!Array.isArray(list)) list = [];
                                        var programTask = list.find(function (t) {
                                            return t && (t.taskType || 'program') === 'program' && t.programName === 'wallpaperengine' && t.triggerType === 'SYSTEM_STARTUP';
                                        });
                                        var serviceTask = list.find(function (t) {
                                            return t && t.taskType === 'service' && t.serviceId === 'wallpaperengine' && t.triggerType === 'SYSTEM_STARTUP';
                                        });
                                        if (programTask && programTask.enabled) {
                                            var del = [];
                                            if (programTask.id) del.push(api.call('ScheduleTask.delete', [programTask.id]));
                                            if (serviceTask && serviceTask.id) del.push(api.call('ScheduleTask.delete', [serviceTask.id]));
                                            return Promise.all(del).then(function () {
                                                WALLPAPERENGINE._autoStartEnabled = false;
                                                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '已关闭程序自启' }]).catch(function () {});
                                            });
                                        }
                                        if (programTask && !programTask.enabled) {
                                            var enableNext = Promise.resolve();
                                            if (!serviceTask) {
                                                enableNext = enableNext.then(function () {
                                                    return api.call('ScheduleTask.create', [
                                                        { taskType: 'service', serviceId: 'wallpaperengine', serviceAction: 'start', triggerType: 'SYSTEM_STARTUP', triggerConfig: {}, enabled: true },
                                                        true
                                                    ]);
                                                });
                                            }
                                            enableNext = enableNext.then(function () {
                                                return api.call('ScheduleTask.setEnabled', [programTask.id, true]);
                                            });
                                            if (serviceTask && serviceTask.id) {
                                                enableNext = enableNext.then(function () {
                                                    return api.call('ScheduleTask.setEnabled', [serviceTask.id, true]);
                                                });
                                            }
                                            return enableNext.then(function () {
                                                WALLPAPERENGINE._autoStartEnabled = true;
                                                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '已开启程序自启（含服务自启）' }]).catch(function () {});
                                            }).catch(function (e) {
                                                WALLPAPERENGINE._autoStartEnabled = false;
                                                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '自启开启失败: ' + (e && e.message) }]).catch(function () {});
                                            });
                                        }
                                        return api.call('ScheduleTask.create', [
                                            { taskType: 'service', serviceId: 'wallpaperengine', serviceAction: 'start', triggerType: 'SYSTEM_STARTUP', triggerConfig: {}, enabled: true },
                                            true
                                        ]).then(function () {
                                            return api.call('ScheduleTask.create', [
                                                { taskType: 'program', programName: 'wallpaperengine', triggerType: 'SYSTEM_STARTUP', triggerConfig: {}, enabled: true, runInBackground: true },
                                                true
                                            ]);
                                        }).then(function () {
                                            WALLPAPERENGINE._autoStartEnabled = true;
                                            api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '已开启程序自启（含服务自启）' }]).catch(function () {});
                                        }).catch(function (e) {
                                            WALLPAPERENGINE._autoStartEnabled = false;
                                            api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '自启开启失败: ' + (e && e.message) }]).catch(function () {});
                                        });
                                    }).catch(function () {});
                                })();
                            }
                        },
                        {
                            label: '查看API文档',
                            onClick: function () {
                                WALLPAPERENGINE._openApiDocWindow();
                            }
                        },
                        {
                            label: '库',
                            onClick: function () {
                                WALLPAPERENGINE._openLibraryWindow();
                            }
                        },
                        {
                            label: '重启服务',
                            onClick: function () {
                                WALLPAPERENGINE._restartService();
                            }
                        }
                    ];
                }
            ]).catch(function () {});
            (function refreshAutoStartState() {
                if (!api || typeof api.call !== 'function') return;
                api.call('ScheduleTask.getAll', []).then(function (list) {
                    if (!Array.isArray(list)) return;
                    var programTask = list.find(function (t) {
                        return t && (t.taskType || 'program') === 'program' && t.programName === 'wallpaperengine' && t.triggerType === 'SYSTEM_STARTUP';
                    });
                    WALLPAPERENGINE._autoStartEnabled = programTask ? !!programTask.enabled : false;
                }).catch(function () {});
            })();
        },

        _onCloseRequest: function () {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('WallpaperEngine', 'requestSelfTermination 失败: ' + (e && e.message));
                    }
                });
            }
        },

        _closeDocWindow: function () {
            if (this._docWindowId && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this._docWindowId);
                this._docWindowId = null;
            }
            if (this._docWindow && this._docWindow.parentNode) {
                this._docWindow.parentNode.removeChild(this._docWindow);
            }
            this._docWindow = null;
        },

        _closeLibraryWindow: function () {
            if (this._libraryWindowId && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this._libraryWindowId);
                this._libraryWindowId = null;
            }
            if (this._libraryWindow && this._libraryWindow.parentNode) {
                this._libraryWindow.parentNode.removeChild(this._libraryWindow);
            }
            this._libraryWindow = null;
        },

        _getLibraryRegistry: function () {
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') return Promise.resolve({ version: 1, items: [], enabledId: null });
            return api.call('LocalStorage.get', [LIBRARY_REGISTRY_KEY]).then(function (raw) {
                if (raw != null && typeof raw === 'object' && Array.isArray(raw.items)) {
                    return { version: raw.version || 1, items: raw.items, enabledId: raw.enabledId != null ? raw.enabledId : null };
                }
                return { version: 1, items: [], enabledId: null };
            }).catch(function () { return { version: 1, items: [], enabledId: null }; });
        },

        _setLibraryRegistry: function (data) {
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') return Promise.resolve();
            return api.call('LocalStorage.set', [LIBRARY_REGISTRY_KEY, data]).catch(function () {});
        },

        /**
         * 从壁纸 config.json 解析结果构建运行时 config 对象（constants + options 的 default）
         */
        _buildConfigFromPaperConfig: function (paperConfig) {
            var config = {};
            if (paperConfig && paperConfig.constants && typeof paperConfig.constants === 'object') {
                for (var k in paperConfig.constants) config[k] = paperConfig.constants[k];
            }
            if (paperConfig && paperConfig.options && Array.isArray(paperConfig.options)) {
                paperConfig.options.forEach(function (opt) {
                    if (opt && opt.key !== undefined) config[opt.key] = opt.default;
                });
            }
            return config;
        },

        /**
         * 生成壁纸 bootstrap HTML，由引擎维护；壁纸只需提供 run.js，引擎注入容器、config、加载 run.js 并调用 init/start
         * @param {string} baseUrl 壁纸目录完整 URL（末尾带 /）
         * @param {object} config 运行时 config 对象
         * @returns {string} 完整 HTML 字符串
         */
        _buildWallpaperBootstrapHtml: function (baseUrl, config) {
            var baseUrlJson = JSON.stringify(String(baseUrl));
            var configJson = JSON.stringify(config || {});
            configJson = configJson.replace(/<\//g, '<\\/');
            var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,height=device-height,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;overflow:hidden;}#wallpaper-container{position:absolute;top:0;left:0;width:100%;height:100%;}</style></head><body><div id="wallpaper-container"></div><script>var baseUrl=' + baseUrlJson + ',config=' + configJson + ';var c=document.getElementById("wallpaper-container");var s=document.createElement("script");s.src=baseUrl+"run.js";s.onload=function(){if(window.WALLPAPER_RUN){window.WALLPAPER_RUN.init({container:c,config:config,resourceBase:baseUrl});window.WALLPAPER_RUN.start();}};s.onerror=function(){c.innerHTML="<span style=\\"color:#a0aec0;padding:20px\\">无法加载 run.js</span>";};document.head.appendChild(s);window.addEventListener("contextmenu",function(e){e.preventDefault();if(window.parent&&window.parent.postMessage)window.parent.postMessage({type:"zeros-wallpaperengine-contextmenu",clientX:e.clientX,clientY:e.clientY},"*");});window.addEventListener("click",function(e){if(window.parent&&window.parent.postMessage)window.parent.postMessage({type:"zeros-wallpaperengine-click",clientX:e.clientX,clientY:e.clientY},"*");});window.addEventListener("mousedown",function(e){if(window.parent&&window.parent.postMessage)window.parent.postMessage({type:"zeros-wallpaperengine-mousedown",clientX:e.clientX,clientY:e.clientY},"*");});window.addEventListener("beforeunload",function(){if(window.WALLPAPER_RUN&&typeof window.WALLPAPER_RUN.stop==="function")window.WALLPAPER_RUN.stop();});<\/script></body></html>';
            return html;
        },

        _applyWallpaperById: function (id) {
            var self = this;
            if (!id) return;
            var api = this._kernelAPI;
            var basePath = CACHE_WALLPAPER_DIR + '/' + id + '/';
            var pathUrl = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function')
                ? ProcessManager.convertVirtualPathToUrl(basePath)
                : '';
            if (!pathUrl) return;
            var origin = (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getOrigin === 'function')
                ? SystemInformation.getOrigin()
                : (typeof window !== 'undefined' && window.location ? window.location.origin : '');
            var baseUrl = origin ? (origin.replace(/\/$/, '') + (pathUrl.startsWith('/') ? pathUrl : '/' + pathUrl)) : pathUrl;
            var apply = function (urlToSet) {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-setcontenturl', { detail: { url: urlToSet } }));
                }
            };
            if (!api || typeof api.call !== 'function') {
                apply(baseUrl);
                return;
            }
            api.call('FileSystem.read', [basePath + 'config.json']).then(function (raw) {
                var paperConfig = null;
                try {
                    paperConfig = raw != null ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
                } catch (e) {}
                var config = self._buildConfigFromPaperConfig(paperConfig);
                var html = self._buildWallpaperBootstrapHtml(baseUrl, config);
                var dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
                apply(dataUrl);
            }).catch(function () {
                var html = self._buildWallpaperBootstrapHtml(baseUrl, {});
                var dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
                apply(dataUrl);
            });
        },

        _setEnabledWallpaperId: function (id) {
            var self = this;
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') return Promise.resolve();
            return this._getLibraryRegistry().then(function (reg) {
                reg.enabledId = id || null;
                return self._setLibraryRegistry(reg);
            }).then(function () {
                if (!id) {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-clear'));
                    }
                    return;
                }
                return self._ensureServiceRunning().then(function () {
                    self._applyWallpaperById(id);
                });
            });
        },

        _clearEnabledWallpaper: function () {
            return this._setEnabledWallpaperId(null);
        },

        _deleteWallpaperById: function (id) {
            var self = this;
            var api = this._kernelAPI;
            if (!api || !id) return Promise.resolve();
            var path = CACHE_WALLPAPER_DIR + '/' + id;
            // 优先删除注册表信息，再删缓存目录（保证列表与注册表一致）
            return this._getLibraryRegistry().then(function (reg) {
                reg.items = (reg.items || []).filter(function (item) { return item.id !== id; });
                if (reg.enabledId === id) reg.enabledId = null;
                return self._setLibraryRegistry(reg).then(function () {
                    return api.call('FileSystem.delete', [path]).catch(function () {});
                });
            }).then(function () {
                if (self._librarySelectedId === id && self._setLibrarySelection) {
                    self._setLibrarySelection(null);
                }
                if (self._refreshLibraryList) self._refreshLibraryList();
                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '已删除壁纸' }]).catch(function () {});
            }).catch(function (e) {
                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '删除失败: ' + (e && e.message ? e.message : '') }]).catch(function () {});
            });
        },

        _ensureWallpaperCacheDir: function () {
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') return Promise.reject(new Error('无内核 API'));
            function hasDir(list, name) {
                var dirs = (list && list.directories) ? list.directories : [];
                return dirs.some(function (d) { return (d.name != null ? d.name : d.fileName) === name; });
            }
            function createIfMissing(parentPath, dirName, fullPath) {
                return api.call('FileSystem.list', [parentPath]).then(function (list) {
                    if (hasDir(list, dirName)) return Promise.resolve();
                    return api.call('FileSystem.create', ['directory', fullPath]).catch(function (e) {
                        if (e && e.message && e.message.indexOf('已存在') >= 0) return;
                        throw e;
                    });
                });
            }
            return createIfMissing('D:/', 'cache', 'D:/cache').then(function () {
                return createIfMissing('D:/cache', 'wallpaper', CACHE_WALLPAPER_DIR);
            });
        },

        _ensureCacheDir: function (id) {
            var self = this;
            var api = this._kernelAPI;
            if (!api || !id) return this._ensureWallpaperCacheDir();
            return this._ensureWallpaperCacheDir().then(function () {
                return api.call('FileSystem.list', [CACHE_WALLPAPER_DIR]).then(function (list) {
                    var dirs = (list && list.directories) ? list.directories : [];
                    var exists = dirs.some(function (d) { return (d.name != null ? d.name : d.fileName) === id; });
                    if (exists) return Promise.resolve();
                    return api.call('FileSystem.create', ['directory', CACHE_WALLPAPER_DIR + '/' + id]).catch(function (e) {
                        if (e && e.message && e.message.indexOf('已存在') >= 0) return;
                        throw e;
                    });
                });
            });
        },

        _importPaper: function () {
            var self = this;
            var api = this._kernelAPI;
            if (!api || typeof api.call !== 'function') {
                api && api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '无法导入：无内核 API' }]).catch(function () {});
                return;
            }
            if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '无法打开文件选择' }]).catch(function () {});
                return;
            }
            ProcessManager.startProgram('filemanager', {
                args: ['D:'],
                mode: 'file-selector',
                onFileSelected: function (item) {
                    if (!item || !item.path) return Promise.resolve();
                    var path = String(item.path);
                    var name = (item.name != null ? item.name : (item.fileName || '')) || path.split('/').pop() || path.split('\\').pop() || '';
                    if (path.toLowerCase().lastIndexOf('.paper') !== path.length - 6) {
                        api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '请选择 .paper 壁纸文件' }]).catch(function () {});
                        return Promise.resolve();
                    }
                    var id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                    var origin = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location ? window.location.origin : '');
                    var url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject && SystemInformation.SERVICE_NAMES && SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE)
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE, { upid: self._upid })
                        : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getCompressionDirvePath) ? SystemInformation.getCompressionDirvePath() : '/system/service/CompressionDirve.php', origin);
                    if (self._upid != null) url.searchParams.set('upid', String(self._upid));
                    return self._ensureCacheDir(id)
                        .then(function () {
                            url.searchParams.set('action', 'extract_zip');
                            url.searchParams.set('sourcePath', path);
                            url.searchParams.set('targetPath', CACHE_WALLPAPER_DIR + '/' + id);
                            return fetch(url.toString()).then(function (res) { return res.json(); });
                        })
                        .then(function (result) {
                            if (result.status !== 'success') {
                                throw new Error(result.message || '解压失败');
                            }
                            return self._getLibraryRegistry();
                        })
                        .then(function (reg) {
                            var entry = {
                                id: id,
                                path: CACHE_WALLPAPER_DIR + '/' + id,
                                sourceFile: path,
                                name: name.replace(/\.paper$/i, '') || id,
                                addedAt: Date.now()
                            };
                            reg.items = reg.items || [];
                            reg.items.push(entry);
                            return self._setLibraryRegistry(reg).then(function () { return entry; });
                        })
                        .then(function () {
                            api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '导入成功' }]).catch(function () {});
                            if (self._libraryListPanel && self._refreshLibraryList && typeof self._refreshLibraryList === 'function') {
                                self._refreshLibraryList();
                            }
                        })
                        .catch(function (e) {
                            var msg = (e && e.message) ? e.message : String(e);
                            api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '导入失败: ' + msg }]).catch(function () {});
                        });
                }
            }).catch(function (e) {
                api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '打开文件选择失败: ' + (e && e.message ? e.message : String(e)) }]).catch(function () {});
            });
        },

        _getPreviewUrlForId: function (id) {
            var api = this._kernelAPI;
            var basePath = CACHE_WALLPAPER_DIR + '/' + id;
            if (!api || typeof api.call !== 'function') return Promise.resolve('');
            return api.call('FileSystem.list', [basePath]).then(function (list) {
                var files = (list && list.files) ? list.files : [];
                var name = '';
                for (var i = 0; i < files.length; i++) {
                    var n = (files[i].name != null ? files[i].name : files[i].fileName) || '';
                    if (/^preview\.(png|svg|jpg|jpeg)$/i.test(n)) {
                        name = n;
                        break;
                    }
                }
                if (!name) return '';
                var path = basePath + '/' + name;
                return (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function')
                    ? ProcessManager.convertVirtualPathToUrl(path)
                    : path;
            }).catch(function () { return ''; });
        },

        _refreshLibraryList: function () {
            var self = this;
            var listEl = this._libraryListItemsEl;
            var api = this._kernelAPI;
            if (!listEl || !api || typeof api.call !== 'function') return;
            listEl.innerHTML = '<div style="padding:12px;color:var(--theme-text-secondary,#a0aec0);">加载中…</div>';
            this._ensureWallpaperCacheDir()
                .then(function () { return self._getLibraryRegistry(); })
                .then(function (reg) {
                    return api.call('FileSystem.list', [CACHE_WALLPAPER_DIR]).then(function (list) {
                        var dirs = (list && list.directories) ? list.directories : [];
                        var validIds = dirs.map(function (d) { return (d.name != null ? d.name : d.fileName) || ''; }).filter(Boolean);
                        var items = (reg.items || []).filter(function (item) { return validIds.indexOf(item.id) >= 0; });
                        var changed = false;
                        if (items.length !== (reg.items || []).length) {
                            reg.items = items;
                            changed = true;
                        }
                        if (reg.enabledId && validIds.indexOf(reg.enabledId) < 0) {
                            reg.enabledId = null;
                            changed = true;
                        }
                        if (changed) return self._setLibraryRegistry(reg).then(function () { return items; });
                        return items;
                    });
                })
                .then(function (items) {
                    listEl.innerHTML = '';
                    if (items.length === 0) {
                        var placeholder = document.createElement('div');
                        placeholder.className = 'wallpaperengine-library-list-item';
                        placeholder.style.cssText = 'padding:10px 12px;border-radius:6px;margin-bottom:4px;color:var(--theme-text-secondary,#a0aec0);font-size:13px;';
                        placeholder.textContent = '暂无壁纸，点击工具栏「导入壁纸」添加';
                        listEl.appendChild(placeholder);
                        return;
                    }
                    items.forEach(function (entry) {
                        var card = document.createElement('div');
                        card.className = 'wallpaperengine-library-list-item wallpaperengine-library-card';
                        card.dataset.id = entry.id;
                        var pic = document.createElement('div');
                        pic.className = 'wallpaperengine-library-card-pic';
                        pic.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:var(--theme-background-secondary,#2d3748);';
                        var img = document.createElement('img');
                        img.alt = '';
                        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                        pic.appendChild(img);
                        var nameBar = document.createElement('div');
                        nameBar.className = 'wallpaperengine-library-card-name';
                        nameBar.textContent = entry.name || entry.id || '';
                        card.appendChild(pic);
                        card.appendChild(nameBar);
                        listEl.appendChild(card);
                        api.call('FileSystem.read', [CACHE_WALLPAPER_DIR + '/' + entry.id + '/README.json']).then(function (raw) {
                            var readme = null;
                            try { readme = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
                            if (readme && readme.name) nameBar.textContent = readme.name;
                        }).catch(function () {});
                        self._getPreviewUrlForId(entry.id).then(function (url) {
                            if (url) img.src = url;
                        }).catch(function () {});
                        card.addEventListener('click', function () {
                            var id = card.dataset.id;
                            if (self._setLibrarySelection) {
                                self._setLibrarySelection(self._librarySelectedId === id ? null : id);
                            }
                        });
                    });
                })
                .catch(function () {
                    listEl.innerHTML = '<div style="padding:12px;color:var(--theme-text-secondary,#a0aec0);">加载失败</div>';
                });
        },

        _loadLibraryDetail: function (id) {
            var self = this;
            var panel = this._libraryDetailPanel;
            var api = this._kernelAPI;
            if (!panel || !api || typeof api.call !== 'function') return;
            var basePath = CACHE_WALLPAPER_DIR + '/' + id;
            panel.innerHTML = '<div style="padding:16px;color:var(--theme-text-secondary,#a0aec0);">加载中…</div>';
            Promise.all([
                api.call('FileSystem.read', [basePath + '/README.json']).catch(function () { return null; }),
                api.call('FileSystem.read', [basePath + '/config.json']).catch(function () { return null; }),
                self._getLibraryRegistry()
            ]).then(function (results) {
                var readmeRaw = results[0];
                var configRaw = results[1];
                var reg = results[2] || {};
                var readme = null;
                var config = null;
                try { readme = readmeRaw != null && (typeof readmeRaw === 'string' ? JSON.parse(readmeRaw) : readmeRaw) || null; } catch (e) {}
                try { config = configRaw != null && (typeof configRaw === 'string' ? JSON.parse(configRaw) : configRaw) || null; } catch (e) {}
                self._renderLibraryDetail(panel, id, readme, config, reg.enabledId || null);
            }).catch(function () {
                panel.innerHTML = '<div style="padding:16px;color:var(--theme-text-secondary,#a0aec0);">加载详情失败</div>';
            });
        },

        _renderLibraryDetail: function (panel, id, readme, config, enabledId) {
            var self = this;
            var api = this._kernelAPI;
            var basePath = CACHE_WALLPAPER_DIR + '/' + id;
            enabledId = enabledId || null;
            var isEnabled = (enabledId === id);
            var html = '<div class="wallpaperengine-library-detail-inner" style="padding:16px;">';
            html += '<div class="wallpaperengine-detail-actions" style="margin-bottom:20px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
            if (!isEnabled) {
                html += '<button type="button" class="wallpaperengine-btn-enable" data-detail-id="' + self._escapeHtml(id) + '" style="padding:8px 16px;cursor:pointer;background:var(--theme-primary,rgba(139,92,246,0.3));color:var(--theme-text,#d7e0dd);border:1px solid var(--theme-border,rgba(139,92,246,0.5));border-radius:6px;font-size:13px;">启用</button>';
            } else {
                html += '<button type="button" class="wallpaperengine-btn-disable" data-detail-id="' + self._escapeHtml(id) + '" style="padding:8px 16px;cursor:pointer;background:var(--theme-primary,rgba(139,92,246,0.3));color:var(--theme-text,#d7e0dd);border:1px solid var(--theme-border,rgba(139,92,246,0.5));border-radius:6px;font-size:13px;">禁用</button>';
            }
            html += '<button type="button" class="wallpaperengine-btn-delete" data-detail-id="' + self._escapeHtml(id) + '" style="padding:8px 16px;cursor:pointer;background:rgba(239,68,68,0.2);color:var(--theme-text,#d7e0dd);border:1px solid rgba(239,68,68,0.5);border-radius:6px;font-size:13px;">删除壁纸</button>';
            html += '</div>';
            html += '<div class="wallpaperengine-detail-section" style="margin-bottom:20px;">';
            html += '<h3 style="margin:0 0 12px 0;font-size:14px;color:var(--theme-text,#d7e0dd);">壁纸信息</h3>';
            if (readme && typeof readme === 'object') {
                html += '<div style="display:grid;gap:8px;font-size:13px;">';
                if (readme.name) html += '<div><span style="color:var(--theme-text-secondary,#a0aec0);">名称</span>: ' + self._escapeHtml(String(readme.name)) + '</div>';
                if (readme.version) html += '<div><span style="color:var(--theme-text-secondary,#a0aec0);">版本</span>: ' + self._escapeHtml(String(readme.version)) + '</div>';
                if (readme.author) html += '<div><span style="color:var(--theme-text-secondary,#a0aec0);">作者</span>: ' + self._escapeHtml(String(readme.author)) + '</div>';
                if (readme.description) html += '<div><span style="color:var(--theme-text-secondary,#a0aec0);">描述</span>: ' + self._escapeHtml(String(readme.description)) + '</div>';
                if (readme.tags && Array.isArray(readme.tags)) html += '<div><span style="color:var(--theme-text-secondary,#a0aec0);">标签</span>: ' + self._escapeHtml(readme.tags.join(', ')) + '</div>';
                html += '</div>';
            } else {
                html += '<p style="margin:0;color:var(--theme-text-secondary,#a0aec0);">无 README 信息</p>';
            }
            html += '</div>';

            if (config && typeof config === 'object') {
                html += '<div class="wallpaperengine-detail-section wallpaperengine-config-section" style="margin-bottom:20px;" data-config-id="' + self._escapeHtml(id) + '">';
                html += '<h3>配置</h3>';
                if (config.constants && typeof config.constants === 'object') {
                    html += '<div style="margin-bottom:14px;"><span class="wallpaperengine-config-options-title">常量</span><div style="display:grid;gap:6px;margin-top:6px;font-size:13px;color:var(--theme-text-secondary,#a0aec0);">';
                    Object.keys(config.constants).forEach(function (k) {
                        html += '<div><span style="color:var(--theme-text-tertiary,#718096);">' + self._escapeHtml(k) + '</span>: ' + self._escapeHtml(String(config.constants[k])) + '</div>';
                    });
                    html += '</div></div>';
                }
                if (config.options && Array.isArray(config.options)) {
                    html += '<span class="wallpaperengine-config-options-title">可配置项</span><div class="wallpaperengine-config-options">';
                    config.options.forEach(function (opt, idx) {
                        var key = (opt.key || '').replace(/"/g, '&quot;');
                        var lab = self._escapeHtml(opt.label || opt.key || '');
                        var desc = (opt.description && String(opt.description).trim()) ? self._escapeHtml(String(opt.description).trim()) : '';
                        var typ = (opt.type || 'string').toLowerCase();
                        var val = opt.default;
                        var valStr = val === undefined || val === null ? '' : String(val);
                        html += '<div class="wallpaperengine-config-row" data-option-index="' + idx + '" data-option-key="' + self._escapeHtml(opt.key) + '">';
                        if (typ === 'boolean') {
                            html += '<label class="wallpaperengine-config-label-inline"><input type="checkbox" data-config-option-key="' + key + '" ' + (val ? ' checked' : '') + '> ' + lab + '</label>';
                            if (desc) html += '<div class="wallpaperengine-config-desc">' + desc + '</div>';
                        } else {
                            html += '<label>' + lab + '</label>';
                            if (desc) html += '<div class="wallpaperengine-config-desc">' + desc + '</div>';
                            if (typ === 'number') {
                                var min = opt.min != null ? opt.min : '';
                                var max = opt.max != null ? opt.max : '';
                                var step = opt.step != null ? opt.step : '';
                                html += '<input type="number" data-config-option-key="' + key + '" value="' + self._escapeHtml(valStr) + '"' + (min !== '' ? ' min="' + min + '"' : '') + (max !== '' ? ' max="' + max + '"' : '') + (step !== '' ? ' step="' + step + '"' : '') + '>';
                            } else if (typ === 'select' && opt.choices && Array.isArray(opt.choices)) {
                                html += '<select data-config-option-key="' + key + '">';
                                opt.choices.forEach(function (c) {
                                    var v = (typeof c === 'object' && c !== null && c.value !== undefined) ? c.value : c;
                                    var l = (typeof c === 'object' && c !== null && c.label !== undefined) ? c.label : v;
                                    html += '<option value="' + self._escapeHtml(String(v)) + '"' + (val === v || String(val) === String(v) ? ' selected' : '') + '>' + self._escapeHtml(String(l)) + '</option>';
                                });
                                html += '</select>';
                            } else {
                                html += '<input type="text" data-config-option-key="' + key + '" value="' + self._escapeHtml(valStr) + '">';
                            }
                        }
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="wallpaperengine-config-save">保存配置</button>';
                }
                html += '</div>';
            } else {
                html += '<div class="wallpaperengine-detail-section" style="margin-bottom:20px;"><h3>配置</h3><p style="margin:0;color:var(--theme-text-secondary,#a0aec0);font-size:13px;">无 config.json</p></div>';
            }
            html += '</div>';
            panel.innerHTML = html;
            var enableBtn = panel.querySelector('.wallpaperengine-btn-enable');
            if (enableBtn) {
                enableBtn.addEventListener('click', function () {
                    var detailId = enableBtn.getAttribute('data-detail-id');
                    if (detailId) self._setEnabledWallpaperId(detailId).then(function () { self._loadLibraryDetail(detailId); }).catch(function () {});
                });
            }
            var disableBtn = panel.querySelector('.wallpaperengine-btn-disable');
            if (disableBtn) {
                disableBtn.addEventListener('click', function () {
                    var detailId = disableBtn.getAttribute('data-detail-id');
                    if (detailId) self._setEnabledWallpaperId(null).then(function () { self._loadLibraryDetail(detailId); }).catch(function () {});
                });
            }
            var deleteBtn = panel.querySelector('.wallpaperengine-btn-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function () {
                    var detailId = deleteBtn.getAttribute('data-detail-id');
                    if (detailId) {
                        self._deleteWallpaperById(detailId);
                    }
                });
            }
            var saveBtn = panel.querySelector('.wallpaperengine-config-save');
            if (saveBtn && config && config.options && api) {
                saveBtn.addEventListener('click', function () {
                    var opts = config.options;
                    var current = {};
                    opts.forEach(function (opt) {
                        var key = opt.key;
                        var sel = '[data-config-option-key="' + (key || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
                        var input = panel.querySelector(sel);
                        if (!input) return;
                        var typ = (opt.type || 'string').toLowerCase();
                        if (typ === 'boolean') current[key] = input.checked;
                        else if (typ === 'number') current[key] = parseFloat(input.value);
                        else current[key] = input.value;
                    });
                    var newConfig = { constants: config.constants || {}, options: config.options };
                    opts.forEach(function (opt) {
                        var key = opt.key;
                        if (key && current[key] !== undefined) {
                            var idx = config.options.findIndex(function (o) { return o.key === key; });
                            if (idx >= 0 && config.options[idx]) config.options[idx].default = current[key];
                        }
                    });
                    var jsonStr = JSON.stringify(config, null, 2);
                    api.call('FileSystem.write', [basePath + '/config.json', jsonStr, 'OVERWRITE']).then(function () {
                        api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '配置已保存' }]).catch(function () {});
                    }).catch(function (e) {
                        api.call('Notification.create', [{ type: 'snapshot', title: '壁纸引擎', duration: 4000, content: '保存失败: ' + (e && e.message ? e.message : '') }]).catch(function () {});
                    });
                });
            }
        },

        _escapeHtml: function (text) {
            if (text == null || text === '') return '';
            var div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        },

        _openLibraryWindow: function () {
            var self = this;
            var container = this._guiContainer || (this.window && this.window.parentElement);
            if (!container) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('WallpaperEngine', '无容器，无法打开库');
                return;
            }
            if (this._libraryWindow && this._libraryWindow.parentNode) {
                if (typeof GUIManager !== 'undefined' && this._libraryWindowId) GUIManager.focusWindow(this._libraryWindowId);
                return;
            }
            if (this._docWindow && this._docWindow.parentNode) {
                this._closeDocWindow();
            }
            var win = document.createElement('div');
            win.className = 'wallpaperengine-library-window zos-gui-window';
            win.style.cssText = 'width:640px;height:480px;min-width:400px;min-height:300px;display:flex;flex-direction:column;overflow:hidden;background:var(--theme-background-elevated,#1a202c);';
            var toolbar = document.createElement('div');
            toolbar.className = 'wallpaperengine-library-toolbar';
            toolbar.style.cssText = 'height:44px;min-height:44px;max-height:44px;flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--theme-border,rgba(139,92,246,0.15));box-sizing:border-box;';
            var btnImport = document.createElement('button');
            btnImport.className = 'wallpaperengine-library-btn-import';
            btnImport.textContent = '导入壁纸';
            btnImport.style.cssText = 'padding:6px 12px;cursor:pointer;background:var(--theme-primary,rgba(139,92,246,0.2));color:var(--theme-text,#d7e0dd);border:1px solid var(--theme-border,rgba(139,92,246,0.3));border-radius:6px;font-size:13px;';
            btnImport.addEventListener('click', function () {
                WALLPAPERENGINE._importPaper();
            });
            toolbar.appendChild(btnImport);
            var contentMain = document.createElement('div');
            contentMain.className = 'wallpaperengine-library-content-main';
            contentMain.style.cssText = 'flex:1;display:flex;overflow:hidden;min-height:0;';
            var leftPanel = document.createElement('div');
            leftPanel.className = 'wallpaperengine-library-list';
            leftPanel.style.cssText = 'flex:0 0 60%;width:60%;min-width:0;overflow:auto;border-right:1px solid var(--theme-border,rgba(139,92,246,0.15));display:flex;flex-direction:column;';
            leftPanel.innerHTML = '<div class="wallpaperengine-library-list-title" style="padding:12px;font-size:13px;color:var(--theme-text-secondary,#a0aec0);flex-shrink:0;">已安装壁纸</div><div class="wallpaperengine-library-list-hint" style="padding:8px 12px;font-size:11px;color:var(--theme-text-secondary,#a0aec0);flex-shrink:0;">操作结果将通过系统通知显示</div><div class="wallpaperengine-library-list-items wallpaperengine-library-cards"></div>';
            var listItemsEl = leftPanel.querySelector('.wallpaperengine-library-list-items');
            var rightPanel = document.createElement('div');
            rightPanel.className = 'wallpaperengine-library-detail';
            rightPanel.style.cssText = 'flex:0 0 40%;width:40%;min-width:0;overflow:auto;transition:flex 0.25s ease, width 0.25s ease, opacity 0.25s ease, min-width 0.25s ease;';
            rightPanel.innerHTML = '<div style="padding:16px;color:var(--theme-text-secondary,#a0aec0);font-size:14px;">壁纸详细信息</div>';
            contentMain.appendChild(leftPanel);
            contentMain.appendChild(rightPanel);
            win.appendChild(toolbar);
            win.appendChild(contentMain);
            self._libraryDetailPanel = rightPanel;
            self._libraryListPanel = leftPanel;
            self._librarySelectedId = null;
            function setLibrarySelection(selectedId) {
                self._librarySelectedId = selectedId;
                var listEl = self._libraryListItemsEl;
                if (listEl) {
                    var cards = listEl.querySelectorAll('.wallpaperengine-library-list-item[data-id]');
                    for (var c = 0; c < cards.length; c++) {
                        var card = cards[c];
                        if (card.classList) {
                            if (card.dataset.id === selectedId) card.classList.add('wallpaperengine-library-card-selected');
                            else card.classList.remove('wallpaperengine-library-card-selected');
                        } else {
                            card.style.boxShadow = card.dataset.id === selectedId ? '0 0 0 2px var(--theme-primary,rgba(139,92,246,0.8))' : 'none';
                        }
                    }
                }
                if (selectedId) {
                    rightPanel.style.flex = '0 0 40%';
                    rightPanel.style.width = '40%';
                    rightPanel.style.minWidth = '0';
                    rightPanel.style.opacity = '1';
                    rightPanel.style.overflow = 'auto';
                    self._loadLibraryDetail(selectedId);
                } else {
                    rightPanel.style.flex = '0 0 0';
                    rightPanel.style.width = '0';
                    rightPanel.style.minWidth = '0';
                    rightPanel.style.opacity = '0';
                    rightPanel.style.overflow = 'hidden';
                    rightPanel.innerHTML = '<div style="padding:16px;color:var(--theme-text-secondary,#a0aec0);font-size:14px;">壁纸详细信息</div>';
                }
            }
            setLibrarySelection(null);
            self._setLibrarySelection = setLibrarySelection;
            self._libraryListItemsEl = listItemsEl;
            self._refreshLibraryList();
            if (typeof GUIManager !== 'undefined') {
                var info = GUIManager.registerWindow(this.pid, win, {
                    title: '壁纸库',
                    icon: null,
                    borderless: false,
                    noTitleBar: false,
                    onClose: function () {
                        self._closeLibraryWindow();
                    }
                });
                if (info && info.windowId) this._libraryWindowId = info.windowId;
            }
            container.appendChild(win);
            this._libraryWindow = win;
        },

        _renderMarkdown: function (md) {
            if (!md || typeof md !== 'string') return '';
            var self = this;
            function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
            function inline(s) {
                s = esc(s);
                s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
                s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
                s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
                s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
                s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
                s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                return s;
            }
            var html = '<div class="wallpaperengine-doc-content">';
            var lines = md.split('\n');
            var i = 0;
            var inCode = false;
            var codeBuf = [];
            var codeLang = '';
            var inList = false;
            var listTag = '';
            var inTable = false;
            var tableRows = [];

            function flushList() {
                if (inList) { html += '</' + listTag + '>'; inList = false; }
            }
            function flushTable() {
                if (!inTable || tableRows.length === 0) return;
                html += '<table><thead><tr>';
                tableRows[0].forEach(function (cell) { html += '<th>' + inline(cell.trim()) + '</th>'; });
                html += '</tr></thead><tbody>';
                for (var r = 1; r < tableRows.length; r++) {
                    html += '<tr>';
                    tableRows[r].forEach(function (cell) { html += '<td>' + inline(cell.trim()) + '</td>'; });
                    html += '</tr>';
                }
                html += '</tbody></table>';
                tableRows = [];
                inTable = false;
            }
            function parseTableRow(line) {
                var cells = [];
                var cell = '';
                for (var k = 0; k < line.length; k++) {
                    if (line[k] === '|' && (k === 0 || line[k - 1] !== '\\')) {
                        if (cell.trim() !== '' || cells.length > 0) cells.push(cell);
                        cell = '';
                    } else {
                        cell += line[k];
                    }
                }
                if (cell.trim() !== '' || cells.length > 0) cells.push(cell);
                return cells;
            }

            while (i < lines.length) {
                var line = lines[i];
                var t = line.trim();
                if (t.indexOf('```') === 0) {
                    flushList();
                    flushTable();
                    if (inCode) {
                        codeLang = (codeLang && codeLang !== '') ? ' language-' + codeLang : '';
                        html += '<pre><code class="' + codeLang + '">' + esc(codeBuf.join('\n')) + '</code></pre>';
                        codeBuf = [];
                        inCode = false;
                    } else {
                        inCode = true;
                        codeLang = t.slice(3).trim();
                    }
                    i++;
                    continue;
                }
                if (inCode) { codeBuf.push(line); i++; continue; }

                if (/^\|.+\|$/.test(t)) {
                    if (/^\|[\s\-:|]+\|$/.test(t.replace(/\s/g, ''))) {
                        i++;
                        continue;
                    }
                    flushList();
                    if (!inTable) { inTable = true; tableRows = []; }
                    tableRows.push(parseTableRow(t));
                    i++;
                    continue;
                }
                if (inTable && !/^\|/.test(t)) { flushTable(); }

                if (/^#{1,6}\s/.test(t)) {
                    flushList();
                    flushTable();
                    var level = 0;
                    while (level < t.length && t[level] === '#') level++;
                    var text = t.slice(level).trim();
                    html += '<h' + level + '>' + inline(text) + '</h' + level + '>';
                    i++;
                    continue;
                }
                if (/^[-*+]\s/.test(t)) {
                    flushTable();
                    if (!inList || listTag !== 'ul') { flushList(); html += '<ul>'; inList = true; listTag = 'ul'; }
                    html += '<li>' + inline(t.slice(2)) + '</li>';
                    i++;
                    continue;
                }
                if (/^\d+\.\s/.test(t)) {
                    flushTable();
                    if (!inList || listTag !== 'ol') { flushList(); html += '<ol>'; inList = true; listTag = 'ol'; }
                    html += '<li>' + inline(t.replace(/^\d+\.\s/, '')) + '</li>';
                    i++;
                    continue;
                }
                if (/^>\s?/.test(t)) {
                    flushList();
                    flushTable();
                    html += '<blockquote>' + inline(t.replace(/^>\s?/, '')) + '</blockquote>';
                    i++;
                    continue;
                }
                if (/^[\-\*_]{3,}$/.test(t)) {
                    flushList();
                    flushTable();
                    html += '<hr>';
                    i++;
                    continue;
                }
                if (t) {
                    flushList();
                    flushTable();
                    html += '<p>' + inline(t) + '</p>';
                } else {
                    flushList();
                    if (!inTable) html += '<br>';
                }
                i++;
            }
            flushList();
            flushTable();
            if (inCode && codeBuf.length) html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>';
            html += '</div>';
            return html;
        },

        _openApiDocWindow: function () {
            var self = this;
            var api = this._kernelAPI;
            var container = this._guiContainer || (this.window && this.window.parentElement);
            if (!container) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('WallpaperEngine', '无容器，无法打开 API 文档');
                return;
            }
            if (this._docWindow && this._docWindow.parentNode) {
                if (typeof GUIManager !== 'undefined' && this._docWindowId) GUIManager.focusWindow(this._docWindowId);
                return;
            }
            var docDir = 'D:/application/wallpaperengine/assets/doc';
            var win = document.createElement('div');
            win.className = 'wallpaperengine-doc-window zos-gui-window';
            win.style.cssText = 'width:720px;height:520px;min-width:400px;min-height:280px;display:flex;flex-direction:column;overflow:hidden;background:var(--theme-background-elevated,#1a202c);';
            var layout = document.createElement('div');
            layout.className = 'wallpaperengine-doc-layout';
            var sidebar = document.createElement('div');
            sidebar.className = 'wallpaperengine-doc-sidebar';
            var treeRoot = document.createElement('div');
            treeRoot.className = 'wallpaperengine-doc-tree-root';
            sidebar.appendChild(treeRoot);
            var content = document.createElement('div');
            content.className = 'wallpaperengine-doc-body';
            content.innerHTML = '<div style="color:var(--theme-text-secondary,#a0aec0);">选择左侧文档</div>';
            layout.appendChild(sidebar);
            layout.appendChild(content);
            win.appendChild(layout);

            if (typeof GUIManager !== 'undefined') {
                var info = GUIManager.registerWindow(this.pid, win, {
                    title: 'API 文档',
                    icon: null,
                    borderless: false,
                    noTitleBar: false,
                    onClose: function () {
                        self._closeDocWindow();
                    }
                });
                if (info && info.windowId) this._docWindowId = info.windowId;
            }
            container.appendChild(win);
            this._docWindow = win;

            function buildTree(dirPath, depth) {
                depth = depth || 0;
                return api.call('FileSystem.list', [dirPath]).then(function (result) {
                    var files = (result && result.files && Array.isArray(result.files)) ? result.files : [];
                    var dirs = (result && result.directories && Array.isArray(result.directories)) ? result.directories : [];
                    var mdFiles = files.filter(function (item) {
                        var n = item && (item.name != null ? item.name : item.fileName) ? (item.name || item.fileName) : '';
                        return String(n).toLowerCase().endsWith('.md');
                    });
                    var node = { folders: [], files: mdFiles };
                    var dirPromises = dirs.map(function (d) {
                        var childPath = d.path || dirPath + '/' + (d.name || '');
                        return buildTree(childPath, depth + 1).then(function (child) {
                            node.folders.push({ name: d.name || d.fileName || '', path: childPath, children: child });
                            return child;
                        });
                    });
                    return Promise.all(dirPromises).then(function () {
                        node.folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
                        node.files.sort(function (a, b) { return (a.name || a.fileName || '').localeCompare(b.name || b.fileName || ''); });
                        return node;
                    });
                }).catch(function () { return { folders: [], files: [] }; });
            }

            function renderTree(parentEl, node, depth) {
                depth = depth || 0;
                node.folders.forEach(function (folder) {
                    var folderDiv = document.createElement('div');
                    folderDiv.className = 'wallpaperengine-doc-tree-item folder';
                    folderDiv.dataset.path = folder.path;
                    var arrow = document.createElement('span');
                    arrow.className = 'tree-arrow empty';
                    if (folder.children && (folder.children.folders.length > 0 || folder.children.files.length > 0)) {
                        arrow.className = 'tree-arrow';
                        arrow.textContent = '\u25B6';
                        folderDiv.appendChild(arrow);
                        var childrenDiv = document.createElement('div');
                        childrenDiv.className = 'wallpaperengine-doc-tree-children';
                        childrenDiv.style.display = 'none';
                        folderDiv.appendChild(document.createTextNode(folder.name));
                        parentEl.appendChild(folderDiv);
                        renderTree(childrenDiv, folder.children, depth + 1);
                        parentEl.appendChild(childrenDiv);
                        folderDiv.addEventListener('click', function (e) {
                            e.stopPropagation();
                            var open = childrenDiv.style.display !== 'none';
                            childrenDiv.style.display = open ? 'none' : 'block';
                            arrow.classList.toggle('expanded', !open);
                        });
                    } else {
                        folderDiv.appendChild(arrow);
                        folderDiv.appendChild(document.createTextNode(folder.name));
                        parentEl.appendChild(folderDiv);
                    }
                });
                node.files.forEach(function (file) {
                    var path = file.path || docDir + '/' + (file.name || file.fileName || '');
                    var name = file.name || file.fileName || path.split('/').pop() || '';
                    var item = document.createElement('div');
                    item.className = 'wallpaperengine-doc-tree-item';
                    item.dataset.path = path;
                    item.innerHTML = '<span class="tree-arrow empty"></span>' + name;
                    parentEl.appendChild(item);
                    item.addEventListener('click', function (e) {
                        e.stopPropagation();
                        parentEl.querySelectorAll('.wallpaperengine-doc-tree-item').forEach(function (el) { el.classList.remove('active'); });
                        item.classList.add('active');
                        content.innerHTML = '<div style="color:var(--theme-text-secondary,#a0aec0);">加载中…</div>';
                        api.call('FileSystem.read', [path]).then(function (result) {
                            var text = (typeof result === 'string') ? result : (result && result.content != null ? result.content : '');
                            content.innerHTML = '<h1 style="font-size:1.3em;margin:0 0 12px;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:8px;">' + name + '</h1>' + self._renderMarkdown(text);
                        }).catch(function () {
                            content.innerHTML = '<p>读取失败: ' + name + '</p>';
                        });
                    });
                });
            }

            if (!api || typeof api.call !== 'function') {
                content.innerHTML = '<div style="padding:16px;">需要内核 API 才能读取 assets/doc。</div>';
                return;
            }
            treeRoot.innerHTML = '<div style="padding:8px 12px;color:var(--theme-text-secondary,#a0aec0);font-size:12px;">加载中…</div>';
            buildTree(docDir).then(function (root) {
                treeRoot.innerHTML = '';
                if (root.folders.length === 0 && root.files.length === 0) {
                    treeRoot.innerHTML = '<div style="padding:8px 12px;color:var(--theme-text-secondary,#a0aec0);font-size:12px;">暂无 .md 文档</div>';
                    return;
                }
                renderTree(treeRoot, root);
                var firstFileItem = treeRoot.querySelector('.wallpaperengine-doc-tree-item:not(.folder)');
                if (firstFileItem) firstFileItem.click();
            }).catch(function (e) {
                treeRoot.innerHTML = '<div style="padding:8px 12px;color:var(--theme-text-secondary,#a0aec0);font-size:12px;">加载失败</div>';
                content.innerHTML = '<div style="padding:16px;">列举 assets/doc 失败: ' + (e && e.message ? e.message : String(e)) + '</div>';
            });
        },

        __exit__: async function () {
            this._closeDocWindow();
            this._closeLibraryWindow();
            if (typeof EventManager !== 'undefined') {
                for (let i = 0; i < this.eventHandlers.length; i++) {
                    try {
                        EventManager.unregisterEventHandler(this.eventHandlers[i]);
                    } catch (e) {}
                }
            }
            this.eventHandlers = [];
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }
            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
            this._trayPanel = null;
            this._guiContainer = null;
            this._autoStartEnabled = undefined;
            this._runInBackground = undefined;
        }
    };

    if (typeof window !== 'undefined') {
        window.WALLPAPERENGINE = WALLPAPERENGINE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.WALLPAPERENGINE = WALLPAPERENGINE;
    }
})(typeof window !== 'undefined' ? window : globalThis);
