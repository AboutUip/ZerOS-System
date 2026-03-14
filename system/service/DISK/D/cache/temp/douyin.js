// ZerOS 短视频（抖音风格）- 仅基础刷视频，无评论/收藏等
// 数据来自聚合短视频接口，界面不展示任何 API 赞助商信息

(function(window) {
    'use strict';

    const PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
    const API_JXSP = 'https://api.suyanw.cn/api/jxsp.php';
    const API_KS2 = 'https://api.suyanw.cn/api/ks2.php';
    const VIDEO_CATEGORIES = ['精选', '网红', '明星', '热舞', '风景', '游戏', '萌宠'];
    const DOUYIN_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z" fill="#333333"/><path d="M759.296 448.512c-48.896 0-96.256-15.872-135.424-45.056v204.8c0 104.448-80.64 189.184-179.968 189.184s-179.968-84.736-179.968-189.184 80.64-189.184 179.968-189.184c9.984 0 19.712 0.768 28.928 2.56V529.92c-8.96-3.584-18.688-5.376-28.16-5.376-44.288 0-80.384 37.632-80.384 84.48s36.096 84.48 80.384 84.48 80.128-37.632 80.128-84.48V202.24h100.352c0 78.336 60.416 141.568 134.656 141.568v104.704h-0.512" fill="#FFFFFF"/></svg>';

    const DOUYIN = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,
        eventHandlers: [],
        dragHandle: null,
        videoContainer: null,
        videoEl: null,
        titleEl: null,
        loadingEl: null,
        errorEl: null,
        _loading: false,
        _swiperInstance: null,
        _swiperContainer: null,
        _slideEls: [],
        _currentCategory: '风景',

        __info__: function() {
            return {
                name: '抖音',
                type: 'GUI',
                version: '1.0.0',
                description: '抖音',
                author: 'ZerOS',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.GUI_WINDOW_CREATE,
                    PM.EVENT_LISTENER,
                    PM.NETWORK_ACCESS,
                    PM.PROCESS_BACKGROUND
                ] : [],
                metadata: {
                    allowMultipleInstances: false,
                    category: 'entertainment',
                    showOnDesktop: true,
                    supportsPreview: true
                }
            };
        },

        __init__: async function(pid, initArgs) {
            this.pid = null;
            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
            this.eventHandlers = [];
            this.dragHandle = null;
            this.videoContainer = null;
            this.videoEl = null;
            this.titleEl = null;
            this.loadingEl = null;
            this.errorEl = null;
            this._loading = false;
            this._swiperInstance = null;
            this._swiperContainer = null;
            this._slideEls = [];
            this._currentCategory = '风景';
            this._volumeChangeHandler = null;
            this._visibilityHandler = null;

            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('DOUYIN', '未找到 gui-container');
                }
                return;
            }

            this.window = document.createElement('div');
            this.window.className = 'douyin-window zos-gui-window';
            this.window.dataset.pid = String(pid);
            this.window.style.cssText = `
                width: 468px;
                height: 720px;
                min-width: 468px;
                min-height: 720px;
                display: flex;
                flex-direction: row;
                overflow: hidden;
            `;

            const SIDEBAR_WIDTH = 48;
            const leftCol = document.createElement('div');
            leftCol.className = 'douyin-sidebar';
            leftCol.style.cssText = `
                width: ${SIDEBAR_WIDTH}px;
                min-width: ${SIDEBAR_WIDTH}px;
                max-width: ${SIDEBAR_WIDTH}px;
                height: 100%;
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                background: var(--theme-window-titlebar-bg, rgba(0,0,0,0.3));
                border-right: 1px solid var(--theme-border, rgba(255,255,255,0.1));
                cursor: move;
                user-select: none;
            `;
            const sidebarBrand = this._createSidebarBrand();
            leftCol.appendChild(sidebarBrand);
            const sidebarCategories = this._createSidebarCategories();
            leftCol.appendChild(sidebarCategories);
            const sidebarSpacer = document.createElement('div');
            sidebarSpacer.style.cssText = 'flex: 1; min-height: 0;';
            leftCol.appendChild(sidebarSpacer);
            const winControls = document.createElement('div');
            winControls.className = 'douyin-win-controls';
            winControls.style.cssText = `
                height: 132px;
                min-height: 132px;
                max-height: 132px;
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 8px 0;
                box-sizing: border-box;
            `;
            const btnStyle = `
                width: 32px;
                height: 32px;
                min-width: 32px;
                min-height: 32px;
                padding: 0;
                border: none;
                border-radius: 6px;
                background: transparent;
                color: var(--theme-text-primary, rgba(255,255,255,0.9));
                font-size: 16px;
                line-height: 1;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            const btnMin = document.createElement('button');
            btnMin.className = 'douyin-btn douyin-btn-minimize';
            btnMin.setAttribute('type', 'button');
            btnMin.setAttribute('aria-label', '最小化');
            btnMin.textContent = '−';
            btnMin.style.cssText = btnStyle;
            const btnMax = document.createElement('button');
            btnMax.className = 'douyin-btn douyin-btn-maximize';
            btnMax.setAttribute('type', 'button');
            btnMax.setAttribute('aria-label', '最大化');
            btnMax.textContent = '□';
            btnMax.style.cssText = btnStyle;
            const btnClose = document.createElement('button');
            btnClose.className = 'douyin-btn douyin-btn-close';
            btnClose.setAttribute('type', 'button');
            btnClose.setAttribute('aria-label', '关闭');
            btnClose.textContent = '×';
            btnClose.style.cssText = btnStyle;
            winControls.appendChild(btnMin);
            winControls.appendChild(btnMax);
            winControls.appendChild(btnClose);
            leftCol.appendChild(winControls);
            this.window.appendChild(leftCol);
            this.dragHandle = leftCol;

            const rightPart = document.createElement('div');
            rightPart.className = 'douyin-right';
            rightPart.style.cssText = `
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            const slide0 = this._createSlideEl();
            this.videoEl = slide0.videoEl;
            this.titleEl = slide0.titleEl;
            this.loadingEl = slide0.loadingEl;
            this.errorEl = slide0.errorEl;
            this._slideEls.push(slide0);

            const content = slide0.wrap;
            content.className = 'douyin-content douyin-slide-inner';
            content.style.cssText = `
                flex: 1;
                min-height: 0;
                overflow: auto;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: #000;
                position: relative;
                height: 100%;
            `;

            this.videoContainer = content;
            this._swiperContainer = document.createElement('div');
            this._swiperContainer.className = 'swiper douyin-swiper';
            this._swiperContainer.style.cssText = 'height:100%;width:100%;';
            const wrapper = document.createElement('div');
            wrapper.className = 'swiper-wrapper';
            const slideWrap = document.createElement('div');
            slideWrap.className = 'swiper-slide';
            slideWrap.style.cssText = 'height:100%;';
            slideWrap.appendChild(content);
            wrapper.appendChild(slideWrap);
            this._swiperContainer.appendChild(wrapper);
            rightPart.appendChild(this._swiperContainer);
            this.window.appendChild(rightPart);
            this._initSwiperThenLoad(wrapper, slideWrap);

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('douyin');
                }
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '抖音',
                    icon: icon,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: this.dragHandle,
                    onClose: () => this._onCloseRequest()
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            guiContainer.appendChild(this.window);
            this._registerEventHandlers();
            setTimeout(() => { this._loadNext(); }, 0);
        },

        _createSlideEl: function() {
            const wrap = document.createElement('div');
            wrap.className = 'douyin-content';
            wrap.style.cssText = `
                flex: 1;
                min-height: 0;
                overflow: auto;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: #000;
                position: relative;
                height: 100%;
            `;
            const loadingEl = document.createElement('div');
            loadingEl.className = 'douyin-loading';
            loadingEl.textContent = '加载中…';
            loadingEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.8);font-size:14px;z-index:2;';
            wrap.appendChild(loadingEl);
            const errorEl = document.createElement('div');
            errorEl.className = 'douyin-error';
            errorEl.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,0.9);font-size:14px;padding:16px;text-align:center;z-index:3;';
            errorEl.innerHTML = '<span class="douyin-error-msg"></span><button type="button" class="douyin-error-retry">换一个</button>';
            wrap.appendChild(errorEl);
            const videoEl = document.createElement('video');
            videoEl.className = 'douyin-video';
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('webkit-playsinline', '');
            videoEl.setAttribute('referrerPolicy', 'no-referrer');
            videoEl.controls = false;
            videoEl.loop = true;
            videoEl.muted = false;
            videoEl.autoplay = false;
            videoEl.preload = 'metadata';
            if (typeof VolumeManager !== 'undefined' && typeof VolumeManager.getSystemVolume === 'function') {
                videoEl.volume = Math.max(0, Math.min(1, VolumeManager.getSystemVolume()));
            } else {
                videoEl.volume = 1;
            }
            videoEl.style.cssText = 'width:100%;height:auto;max-height:100%;display:block;object-fit:contain;background:#000;';
            wrap.appendChild(videoEl);
            const titleEl = document.createElement('div');
            titleEl.className = 'douyin-video-title';
            titleEl.style.cssText = 'position:absolute;bottom:44px;left:0;right:0;padding:12px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.5));color:#fff;font-size:13px;z-index:1;';
            wrap.appendChild(titleEl);
            const controlsBar = this._createVideoControlsBar();
            wrap.appendChild(controlsBar);
            const slideData = { wrap: wrap, loadingEl: loadingEl, errorEl: errorEl, videoEl: videoEl, titleEl: titleEl, controlsBar: controlsBar, playBtn: controlsBar.querySelector('.douyin-ctrl-play'), progressEl: controlsBar.querySelector('.douyin-ctrl-progress'), timeEl: controlsBar.querySelector('.douyin-ctrl-time') };
            wrap._douyinSlideData = slideData;
            this._bindSlideControls(slideData);
            return slideData;
        },

        _createSidebarBrand: function() {
            const box = document.createElement('div');
            box.className = 'douyin-sidebar-brand';
            box.style.cssText = 'flex-shrink:0;padding:14px 0;display:flex;flex-direction:column;align-items:center;gap:6px;-webkit-app-region:no-drag;';
            const iconWrap = document.createElement('div');
            iconWrap.className = 'douyin-sidebar-icon';
            iconWrap.style.cssText = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;';
            try {
                iconWrap.innerHTML = DOUYIN_ICON_SVG;
                const svg = iconWrap.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '32');
                    svg.setAttribute('height', '32');
                    svg.style.display = 'block';
                }
            } catch (e) {}
            box.appendChild(iconWrap);
            const label = document.createElement('span');
            label.className = 'douyin-sidebar-label';
            label.textContent = '抖音';
            label.style.cssText = 'font-size:12px;font-weight:600;color:var(--theme-text-primary,rgba(255,255,255,0.95));letter-spacing:0.5px;';
            box.appendChild(label);
            return box;
        },

        _createSidebarCategories: function() {
            const self = this;
            const box = document.createElement('div');
            box.className = 'douyin-sidebar-categories';
            box.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0;-webkit-app-region:no-drag;';
            const btnStyle = 'width:40px;height:28px;padding:0 4px;border:none;border-radius:6px;background:transparent;color:var(--theme-text-secondary,rgba(255,255,255,0.7));font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            const activeStyle = 'background:var(--theme-accent,rgba(0,122,255,0.4));color:var(--theme-text-primary,#fff);';
            VIDEO_CATEGORIES.forEach(function(cat) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'douyin-cat-item';
                btn.dataset.category = cat;
                btn.textContent = cat;
                btn.style.cssText = btnStyle;
                if (cat === self._currentCategory) btn.style.cssText = btnStyle + activeStyle;
                btn.setAttribute('aria-label', '分类 ' + cat);
                box.appendChild(btn);
            });
            this._sidebarCategoryBox = box;
            return box;
        },

        _createVideoControlsBar: function() {
            const bar = document.createElement('div');
            bar.className = 'douyin-video-controls';
            bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px 8px;background:linear-gradient(transparent,rgba(0,0,0,0.75));color:#fff;z-index:2;';
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'douyin-ctrl-play';
            playBtn.setAttribute('aria-label', '播放');
            playBtn.innerHTML = '&#9658;';
            playBtn.style.cssText = 'width:36px;height:36px;flex-shrink:0;border:none;border-radius:50%;background:rgba(255,255,255,0.25);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;';
            const progressWrap = document.createElement('div');
            progressWrap.className = 'douyin-ctrl-progress-wrap';
            progressWrap.style.cssText = 'flex:1;min-width:0;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;cursor:pointer;position:relative;';
            const progressEl = document.createElement('input');
            progressEl.type = 'range';
            progressEl.className = 'douyin-ctrl-progress';
            progressEl.min = 0;
            progressEl.max = 100;
            progressEl.value = 0;
            progressEl.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;margin:0;cursor:pointer;';
            progressWrap.appendChild(progressEl);
            const timeEl = document.createElement('span');
            timeEl.className = 'douyin-ctrl-time';
            timeEl.textContent = '0:00 / 0:00';
            timeEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.9);flex-shrink:0;min-width:72px;text-align:right;';
            bar.appendChild(playBtn);
            bar.appendChild(progressWrap);
            bar.appendChild(timeEl);
            bar.addEventListener('click', function(e) { e.stopPropagation(); });
            return bar;
        },

        _bindSlideControls: function(slideData) {
            const v = slideData.videoEl;
            const playBtn = slideData.playBtn;
            const progressEl = slideData.progressEl;
            const timeEl = slideData.timeEl;
            if (!v || !playBtn) return;
            const formatTime = function(sec) {
                if (!Number.isFinite(sec) || sec < 0) return '0:00';
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return m + ':' + (s < 10 ? '0' : '') + s;
            };
            const updatePlayIcon = function() {
                playBtn.innerHTML = v.paused ? '&#9658;' : '&#10074;&#10074;';
                playBtn.setAttribute('aria-label', v.paused ? '播放' : '暂停');
            };
            const updateProgressAndTime = function() {
                const cur = v.currentTime;
                const dur = v.duration;
                if (Number.isFinite(dur) && dur > 0) {
                    progressEl.value = Math.min(100, (cur / dur) * 100);
                    timeEl.textContent = formatTime(cur) + ' / ' + formatTime(dur);
                } else {
                    timeEl.textContent = formatTime(cur) + ' / 0:00';
                }
            };
            playBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (v.paused) v.play().catch(function() {}); else v.pause();
            });
            v.addEventListener('play', updatePlayIcon);
            v.addEventListener('pause', updatePlayIcon);
            v.addEventListener('timeupdate', updateProgressAndTime);
            v.addEventListener('loadedmetadata', updateProgressAndTime);
            progressEl.addEventListener('input', function() {
                const p = Number(progressEl.value) / 100;
                if (Number.isFinite(v.duration)) v.currentTime = p * v.duration;
            });
            progressEl.addEventListener('change', function() {
                const p = Number(progressEl.value) / 100;
                if (Number.isFinite(v.duration)) v.currentTime = p * v.duration;
            });
            updatePlayIcon();
        },

        _initSwiperThenLoad: function(wrapper, firstSlideWrap) {
            const self = this;
            const trySwiper = function() {
                if (typeof DynamicManager === 'undefined' || typeof DynamicManager.loadModule !== 'function') {
                    setTimeout(() => { self._loadNext(); }, 0);
                    return;
                }
                DynamicManager.loadModule('swiper').then(function(Swiper) {
                    if (!self._swiperContainer || !Swiper) return;
                    self._swiperInstance = new Swiper(self._swiperContainer, {
                        direction: 'vertical',
                        slidesPerView: 1,
                        spaceBetween: 0,
                        speed: 300,
                        touchReleaseOnEdges: true,
                        on: {
                            slideChangeTransitionEnd: function() {
                                const sw = self._swiperInstance;
                                if (!sw) return;
                                const idx = sw.activeIndex;
                                const slides = sw.slides || [];
                                slides.forEach(function(slide, i) {
                                    const v = slide.querySelector ? slide.querySelector('.douyin-video') : null;
                                    if (v) {
                                        if (i === idx) v.play().catch(function() {}); else v.pause();
                                    }
                                });
                                if (idx === slides.length - 1 && idx >= 0) {
                                    const nextSlideData = self._createSlideEl();
                                    self._slideEls.push(nextSlideData);
                                    const nextWrap = document.createElement('div');
                                    nextWrap.className = 'swiper-slide';
                                    nextWrap.style.cssText = 'height:100%;';
                                    nextWrap.appendChild(nextSlideData.wrap);
                                    wrapper.appendChild(nextWrap);
                                    sw.update();
                                    self._loadNextForSlide(nextSlideData);
                                }
                            }
                        }
                    });
                    setTimeout(() => { self._loadNext(); }, 0);
                }).catch(function() {
                    setTimeout(() => { self._loadNext(); }, 0);
                });
            };
            trySwiper();
        },

        _loadNextForSlide: function(slideData) {
            const self = this;
            if (this._loading) return;
            this._loading = true;
            if (slideData.loadingEl) slideData.loadingEl.style.display = 'flex';
            if (slideData.errorEl) slideData.errorEl.style.display = 'none';
            if (slideData.videoEl) { slideData.videoEl.removeAttribute('src'); slideData.videoEl.load(); }
            if (slideData.titleEl) slideData.titleEl.textContent = '';
            const apiUrl = this._getApiUrl();
            fetch(apiUrl, { method: 'GET' }).then(function(res) {
                if (!res.ok) throw new Error('网络错误 ' + res.status);
                return res.text();
            }).then(function(text) {
                return self._parseApiResponse(text);
            }).then(function(data) {
                const parsed = self._parseSuyanwData(data, self._currentCategory);
                if (!parsed || !parsed.url) {
                    self._loading = false;
                    if (slideData.errorEl) {
                        slideData.errorEl.querySelector('.douyin-error-msg').textContent = '未获取到视频地址';
                        slideData.errorEl.style.display = 'flex';
                    }
                    return;
                }
                const url = parsed.url;
                const title = parsed.title || '';
                self._loading = false;
                if (slideData.loadingEl) slideData.loadingEl.style.display = 'none';
                if (slideData.errorEl) slideData.errorEl.style.display = 'none';
                slideData.videoEl.setAttribute('referrerPolicy', 'no-referrer');
                slideData.videoEl.src = url;
                slideData.titleEl.textContent = title || '';
                slideData.videoEl.onerror = function() {
                    if (slideData.errorEl) {
                        slideData.errorEl.querySelector('.douyin-error-msg').textContent = '该视频无法在此环境播放，点击下方换一个';
                        slideData.errorEl.querySelector('.douyin-error-retry').textContent = '换一个';
                        slideData.errorEl.style.display = 'flex';
                    }
                };
                slideData.videoEl.onloadeddata = function() {
                    slideData.videoEl.onerror = null;
                    slideData.videoEl.onloadeddata = null;
                    slideData.videoEl.pause();
                };
            }).catch(function(e) {
                self._loading = false;
                if (slideData.loadingEl) slideData.loadingEl.style.display = 'none';
                if (slideData.errorEl) {
                    slideData.errorEl.querySelector('.douyin-error-msg').textContent = (e && e.message) || '加载失败';
                    slideData.errorEl.querySelector('.douyin-error-retry').textContent = '重试';
                    slideData.errorEl.style.display = 'flex';
                }
            });
        },

        _switchCategory: function(category) {
            if (category === this._currentCategory) return;
            this._currentCategory = category;
            const box = this._sidebarCategoryBox;
            if (box) {
                const activeStyle = 'background:var(--theme-accent,rgba(0,122,255,0.4));color:var(--theme-text-primary,#fff);';
                const btnStyle = 'width:40px;height:28px;padding:0 4px;border:none;border-radius:6px;background:transparent;color:var(--theme-text-secondary,rgba(255,255,255,0.7));font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                const btns = box.querySelectorAll('.douyin-cat-item');
                for (let i = 0; i < btns.length; i++) {
                    btns[i].style.cssText = btns[i].dataset.category === category ? btnStyle + activeStyle : btnStyle;
                }
            }
            this._loading = false;
            const wrapper = this._swiperContainer ? this._swiperContainer.querySelector('.swiper-wrapper') : null;
            if (this._swiperInstance && wrapper && this._slideEls.length > 0) {
                const firstSlideData = this._slideEls[0];
                while (wrapper.children.length > 1) {
                    wrapper.removeChild(wrapper.lastChild);
                }
                this._slideEls = [firstSlideData];
                this._swiperInstance.update();
                if (firstSlideData.videoEl) {
                    firstSlideData.videoEl.removeAttribute('src');
                    firstSlideData.videoEl.load();
                }
                if (firstSlideData.loadingEl) firstSlideData.loadingEl.style.display = 'flex';
                if (firstSlideData.errorEl) firstSlideData.errorEl.style.display = 'none';
                if (firstSlideData.titleEl) firstSlideData.titleEl.textContent = '';
                setTimeout(() => { this._loadNextForSlide(firstSlideData); }, 0);
            } else {
                setTimeout(() => { this._loadNext(); }, 0);
            }
        },

        _registerEventHandlers: function() {
            if (typeof EventManager === 'undefined') return;

            const catBox = this._sidebarCategoryBox;
            if (catBox) {
                const btns = catBox.querySelectorAll('.douyin-cat-item');
                for (let i = 0; i < btns.length; i++) {
                    const btn = btns[i];
                    const cat = btn.dataset.category;
                    const id = EventManager.registerElementEvent(this.pid, btn, 'click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this._switchCategory(cat);
                    });
                    this.eventHandlers.push(id);
                    this.eventHandlers.push(EventManager.registerElementEvent(this.pid, btn, 'mousedown', (e) => e.stopPropagation()));
                }
            }

            const btnMin = this.window.querySelector('.douyin-btn-minimize');
            if (btnMin) {
                const id = EventManager.registerElementEvent(this.pid, btnMin, 'click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof GUIManager !== 'undefined' && this.windowId) GUIManager.minimizeWindow(this.windowId);
                });
                this.eventHandlers.push(id);
                this.eventHandlers.push(EventManager.registerElementEvent(this.pid, btnMin, 'mousedown', (e) => e.stopPropagation()));
            }
            const btnMax = this.window.querySelector('.douyin-btn-maximize');
            if (btnMax) {
                const id = EventManager.registerElementEvent(this.pid, btnMax, 'click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof GUIManager !== 'undefined' && this.windowId) GUIManager.toggleMaximize(this.windowId);
                });
                this.eventHandlers.push(id);
                this.eventHandlers.push(EventManager.registerElementEvent(this.pid, btnMax, 'mousedown', (e) => e.stopPropagation()));
            }
            const btnClose = this.window.querySelector('.douyin-btn-close');
            if (btnClose) {
                const id = EventManager.registerElementEvent(this.pid, btnClose, 'click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._onCloseRequest();
                });
                this.eventHandlers.push(id);
                this.eventHandlers.push(EventManager.registerElementEvent(this.pid, btnClose, 'mousedown', (e) => e.stopPropagation()));
            }

            this._volumeChangeHandler = () => {
                this._applySystemVolumeToVideos();
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('zeros-system-volume-change', this._volumeChangeHandler);
                this._applySystemVolumeToVideos();
            }
            this._visibilityHandler = () => {
                if (typeof document === 'undefined') return;
                if (document.hidden) {
                    this._pauseAllVideos();
                } else {
                    this._resumeActiveVideo();
                }
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', this._visibilityHandler);
            }

            const content = this.videoContainer;
            const container = this._swiperContainer || content;
            if (container) {
                const id = EventManager.registerElementEvent(this.pid, container, 'click', (e) => {
                    if (e.target.closest('.douyin-sidebar')) return;
                    if (e.target.closest('.douyin-error-retry')) {
                        const inner = e.target.closest('.douyin-content');
                        if (inner && inner._douyinSlideData) {
                            inner._douyinSlideData.errorEl.style.display = 'none';
                            this._loadNextForSlide(inner._douyinSlideData);
                        } else {
                            this._hideError();
                            this._loadNext();
                        }
                        return;
                    }
                    this._goToNextSlide();
                });
                this.eventHandlers.push(id);
            }
        },

        _goToNextSlide: function() {
            if (this._swiperInstance) {
                const sw = this._swiperInstance;
                const slides = sw.slides || [];
                if (sw.activeIndex < slides.length - 1) {
                    sw.slideNext();
                } else {
                    const wrapper = this._swiperContainer ? this._swiperContainer.querySelector('.swiper-wrapper') : null;
                    if (wrapper) {
                        const nextSlideData = this._createSlideEl();
                        this._slideEls.push(nextSlideData);
                        const nextWrap = document.createElement('div');
                        nextWrap.className = 'swiper-slide';
                        nextWrap.style.cssText = 'height:100%;';
                        nextWrap.appendChild(nextSlideData.wrap);
                        wrapper.appendChild(nextWrap);
                        sw.update();
                        this._loadNextForSlide(nextSlideData);
                        sw.slideNext();
                    }
                }
            } else {
                this._loadNext();
            }
        },

        _showLoading: function() {
            this._loading = true;
            if (this.loadingEl) this.loadingEl.style.display = 'flex';
            if (this.errorEl) this.errorEl.style.display = 'none';
            if (this.videoEl) {
                this.videoEl.removeAttribute('src');
                this.videoEl.load();
            }
            if (this.titleEl) this.titleEl.textContent = '';
        },

        _hideLoading: function() {
            this._loading = false;
            if (this.loadingEl) this.loadingEl.style.display = 'none';
        },

        _showError: function(msg, isVideoError) {
            this._hideLoading();
            if (this.errorEl) {
                const m = this.errorEl.querySelector('.douyin-error-msg');
                if (m) m.textContent = msg || '加载失败';
                const btn = this.errorEl.querySelector('.douyin-error-retry');
                if (btn) btn.textContent = isVideoError ? '换一个' : '重试';
                this.errorEl.style.display = 'flex';
            }
        },

        _hideError: function() {
            if (this.errorEl) this.errorEl.style.display = 'none';
        },

        _getApiUrl: function(category) {
            const cat = category || this._currentCategory;
            if (cat === '精选') return API_KS2 + '?type=json';
            return API_JXSP + '?type=json&lx=' + encodeURIComponent(cat);
        },

        _parseApiResponse: function(responseText) {
            if (!responseText || typeof responseText !== 'string') return null;
            let s = responseText.trim();
            if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1).trim();
            const jsonPrefix = 'json:';
            if (s.toLowerCase().indexOf(jsonPrefix) === 0) s = s.slice(jsonPrefix.length).trim();
            s = s.replace(/[\u0000-\u001F\u007F]/g, '');
            s = s.replace(/""([a-zA-Z_])/g, '","$1');
            const extraStart = s.indexOf(',"extra":"{"');
            if (extraStart !== -1) {
                const endQuote = s.lastIndexOf('"}');
                if (endQuote > extraStart) s = s.slice(0, extraStart) + ',"extra":""' + s.slice(endQuote + 1);
            }
            try {
                return JSON.parse(s);
            } catch (e1) {
                try {
                    return JSON.parse(atob(s));
                } catch (e2) {
                    throw new Error('响应解析失败');
                }
            }
        },

        _parseSuyanwData: function(data, category) {
            const news = data && data.meta && data.meta.news;
            if (!news) return null;
            const cat = category || this._currentCategory;
            const jumpUrl = news.jumpUrl;
            if (cat !== '精选') {
                if (!jumpUrl) return null;
            }
            const url = jumpUrl || '';
            if (!url) return null;
            const title = news.desc || news.title || data.prompt || '';
            return { url: url, title: title };
        },

        _getVideoPlayUrl: function(originalUrl) {
            if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
            try {
                if (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getVideoProxyUrl === 'function') {
                    const base = SystemInformation.getVideoProxyUrl();
                    const sep = base.indexOf('?') >= 0 ? '&' : '?';
                    return base + sep + 'url=' + encodeURIComponent(originalUrl);
                }
            } catch (e) {}
            return originalUrl;
        },

        _loadNext: async function() {
            if (this._loading) return;
            this._showLoading();

            try {
                const apiUrl = this._getApiUrl();
                const res = await fetch(apiUrl, { method: 'GET' });
                if (!res.ok) throw new Error('网络错误 ' + res.status);
                const text = await res.text();
                const data = this._parseApiResponse(text);
                const parsed = this._parseSuyanwData(data, this._currentCategory);

                if (!parsed || !parsed.url) {
                    this._showError('未获取到视频地址');
                    return;
                }
                const url = parsed.url;
                const title = parsed.title || '';

                this._hideLoading();
                this._hideError();
                this.videoEl.setAttribute('referrerPolicy', 'no-referrer');
                this.videoEl.src = url;
                this.titleEl.textContent = title || '';

                this.videoEl.onerror = () => {
                    this._showError('该视频无法在此环境播放（可能受来源限制），点击下方换一个', true);
                };
                this.videoEl.onloadeddata = () => {
                    this.videoEl.onerror = null;
                    this.videoEl.onloadeddata = null;
                    this.videoEl.play().catch(function() {});
                    this._prependNextSlideIfSwiper();
                };
            } catch (e) {
                this._showError((e && e.message) ? e.message : '加载失败');
            }
        },

        _prependNextSlideIfSwiper: function() {
            if (!this._swiperInstance || !this._swiperContainer) return;
            const wrapper = this._swiperContainer.querySelector('.swiper-wrapper');
            if (!wrapper || (this._swiperInstance.slides && this._swiperInstance.slides.length > 1)) return;
            const nextSlideData = this._createSlideEl();
            this._slideEls.push(nextSlideData);
            const nextWrap = document.createElement('div');
            nextWrap.className = 'swiper-slide';
            nextWrap.style.cssText = 'height:100%;';
            nextWrap.appendChild(nextSlideData.wrap);
            wrapper.appendChild(nextWrap);
            this._swiperInstance.update();
            this._loadNextForSlide(nextSlideData);
        },

        _onCloseRequest: function() {
            this._goToBackground();
        },

        _pauseAllVideos: function() {
            if (!this.window) return;
            try {
                if (this.videoEl && this.videoEl.pause) this.videoEl.pause();
            } catch (e) {}
            for (let i = 0; i < this._slideEls.length; i++) {
                try {
                    if (this._slideEls[i] && this._slideEls[i].videoEl && this._slideEls[i].videoEl.pause) {
                        this._slideEls[i].videoEl.pause();
                    }
                } catch (e) {}
            }
            const list = this.window.querySelectorAll('.douyin-video');
            for (let j = 0; j < list.length; j++) {
                try {
                    if (list[j] && list[j].pause) list[j].pause();
                } catch (e) {}
            }
        },

        _resumeActiveVideo: function() {
            if (!this.window || this.window.style.display === 'none') return;
            if (this._swiperInstance && this._swiperInstance.slides && this._swiperInstance.slides.length) {
                const idx = this._swiperInstance.activeIndex;
                const slideEl = this._swiperInstance.slides[idx];
                const wrap = slideEl ? slideEl.querySelector('.douyin-content') : null;
                const data = wrap && wrap._douyinSlideData;
                if (data && data.videoEl && data.videoEl.src) {
                    data.videoEl.play().catch(function() {});
                }
                return;
            }
            if (this.videoEl && this.videoEl.src) this.videoEl.play().catch(function() {});
        },

        _applySystemVolumeToVideos: function() {
            if (typeof VolumeManager === 'undefined' || typeof VolumeManager.getSystemVolume !== 'function') return;
            const v = Math.max(0, Math.min(1, VolumeManager.getSystemVolume()));
            if (!this.window) return;
            const list = this.window.querySelectorAll('.douyin-video');
            for (let i = 0; i < list.length; i++) {
                try {
                    if (list[i]) list[i].volume = v;
                } catch (e) {}
            }
        },

        _goToBackground: function() {
            if (!this.windowId || !this.window) return;
            this._pauseAllVideos();
            const winInfo = typeof GUIManager !== 'undefined' ? GUIManager.getWindowInfo(this.windowId) : null;
            if (winInfo) {
                winInfo._backgroundRequested = true;
            }
            if (this.window.style) {
                this.window.style.display = 'none';
            }
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestBackground', []).catch(function(err) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('DOUYIN', 'requestBackground 失败: ' + (err && err.message));
                    }
                });
            }
        },

        __exit__: async function() {
            if (typeof document !== 'undefined') {
                if (this._volumeChangeHandler) {
                    document.removeEventListener('zeros-system-volume-change', this._volumeChangeHandler);
                    this._volumeChangeHandler = null;
                }
                if (this._visibilityHandler) {
                    document.removeEventListener('visibilitychange', this._visibilityHandler);
                    this._visibilityHandler = null;
                }
            }
            if (typeof EventManager !== 'undefined') {
                for (let i = 0; i < this.eventHandlers.length; i++) {
                    try {
                        EventManager.unregisterEventHandler(this.eventHandlers[i]);
                    } catch (e) {}
                }
            }
            this.eventHandlers = [];

            if (this._swiperInstance && typeof this._swiperInstance.destroy === 'function') {
                this._swiperInstance.destroy(true, true);
                this._swiperInstance = null;
            }
            if (this.videoEl) {
                this.videoEl.removeAttribute('src');
                this.videoEl.load();
            }
            for (let i = 0; i < this._slideEls.length; i++) {
                if (this._slideEls[i] && this._slideEls[i].videoEl) {
                    this._slideEls[i].videoEl.removeAttribute('src');
                    this._slideEls[i].videoEl.load();
                }
            }
            this._slideEls = [];

            if (typeof GUIManager !== 'undefined') {
                if (this.windowId) {
                    GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid) {
                    GUIManager.unregisterWindow(this.pid);
                }
            }

            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }

            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
            this.dragHandle = null;
            this.videoContainer = null;
            this.videoEl = null;
            this.titleEl = null;
            this.loadingEl = null;
            this.errorEl = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.DOUYIN = DOUYIN;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.DOUYIN = DOUYIN;
    }
})(typeof window !== 'undefined' ? window : globalThis);
