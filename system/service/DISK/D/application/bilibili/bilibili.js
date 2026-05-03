// ZerOS Bilibili native client
// Native API-driven UI; only the official embed player is loaded in an iframe.

(function (window) {
    'use strict';

    const BILIBILI = {
        pid: null,
        window: null,
        windowId: null,
        currentVideo: null,
        currentList: [],
        currentView: 'popular',
        proxyPath: '/system/service/BilibiliProxy.php',

        __info__: function () {
            const P = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
            return {
                name: 'bilibili',
                type: 'GUI',
                version: '1.1.0',
                description: 'Bilibili 原生 ZerOS 客户端',
                author: 'ZerOS Community',
                permissions: [
                    P.GUI_WINDOW_CREATE,
                    P.EVENT_LISTENER,
                    P.NETWORK_ACCESS
                ],
                metadata: {
                    allowMultipleInstances: false,
                    supportsPreview: true,
                    category: 'media'
                }
            };
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');

            this.window = document.createElement('div');
            this.window.className = 'bilibili-window zos-gui-window';
            this.window.dataset.pid = String(pid);
            this._renderShell();

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined' && ApplicationAssetManager.getIcon) {
                    icon = ApplicationAssetManager.getIcon('bilibili');
                }
                const reg = GUIManager.registerWindow(pid, this.window, {
                    title: '哔哩哔哩',
                    icon,
                    onClose: () => {}
                });
                this.windowId = reg && reg.windowId ? reg.windowId : null;
            }

            guiContainer.appendChild(this.window);
            this._bindEvents();
            this._renderWelcome();
            await this.loadPopular();
        },

        __exit__: async function () {
            try {
                if (typeof EventManager !== 'undefined') {
                    EventManager.unregisterAllHandlersForPid(this.pid);
                }
                const iframe = this._playerFrame();
                if (iframe) iframe.src = 'about:blank';
                if (this.windowId && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.windowId);
                } else if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
            } catch (error) {
                this._log('warn', '__exit__ 清理失败', error);
            }
            this.window = null;
            this.windowId = null;
            this.currentVideo = null;
            this.currentList = [];
        },

        _renderShell: function () {
            this.window.innerHTML = [
                '<div class="bili-app">',
                '  <header class="bili-topbar">',
                '    <div class="bili-brand">',
                '      <div class="bili-brand-icon">bili</div>',
                '      <div><strong>哔哩哔哩</strong><span>ZerOS 原生客户端</span></div>',
                '    </div>',
                '    <form class="bili-search" data-bili-search>',
                '      <input data-bili-keyword type="search" placeholder="搜索视频、UP 主、番剧..." autocomplete="off" />',
                '      <button type="submit">搜索</button>',
                '    </form>',
                '    <div class="bili-status" data-bili-status>准备就绪</div>',
                '  </header>',
                '  <div class="bili-body">',
                '    <aside class="bili-rail">',
                '      <button type="button" data-bili-action="popular" class="is-active"><span>热门</span><small>Popular</small></button>',
                '      <button type="button" data-bili-action="weekly"><span>每周必看</span><small>Weekly</small></button>',
                '      <button type="button" data-bili-action="precious"><span>入站必刷</span><small>Must Watch</small></button>',
                '      <button type="button" data-bili-action="movie"><span>影视热播</span><small>PGC</small></button>',
                '      <div class="bili-up-search">',
                '        <label>UP 主空间</label>',
                '        <input data-bili-uid type="text" placeholder="输入 UID" />',
                '        <div>',
                '          <button type="button" data-bili-action="userVideos">投稿</button>',
                '          <button type="button" data-bili-action="liveStatus">直播</button>',
                '        </div>',
                '      </div>',
                '    </aside>',
                '    <main class="bili-feed">',
                '      <section class="bili-hero">',
                '        <div>',
                '          <p class="bili-kicker" data-bili-kicker>高仿信息流</p>',
                '          <h1 data-bili-title>热门视频</h1>',
                '          <p data-bili-subtitle>点击卡片即可在右侧播放，详情和扩展数据在播放器下方展示。</p>',
                '        </div>',
                '        <div class="bili-hero-badge">Native</div>',
                '      </section>',
                '      <section class="bili-card-grid" data-bili-list></section>',
                '    </main>',
                '    <aside class="bili-watch">',
                '      <section class="bili-player-wrap">',
                '        <iframe data-bili-player title="Bilibili Player" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="no-referrer-when-downgrade"></iframe>',
                '        <div class="bili-empty" data-bili-empty>',
                '          <strong>选择一个视频开始播放</strong>',
                '          <span>播放页使用官方嵌入播放器，首页与详情为 ZerOS 原生实现。</span>',
                '        </div>',
                '      </section>',
                '      <section class="bili-detail" data-bili-detail></section>',
                '    </aside>',
                '  </div>',
                '</div>'
            ].join('');
        },

        _bindEvents: function () {
            this._on('[data-bili-search]', 'submit', (event) => {
                event.preventDefault();
                const input = this.window.querySelector('[data-bili-keyword]');
                const keyword = input ? input.value.trim() : '';
                if (keyword) this.search(keyword);
            });

            this._on('[data-bili-action="popular"]', 'click', () => this.loadPopular());
            this._on('[data-bili-action="weekly"]', 'click', () => this.loadWeekly());
            this._on('[data-bili-action="precious"]', 'click', () => this.loadPrecious());
            this._on('[data-bili-action="movie"]', 'click', () => this.loadMovieRanking());
            this._on('[data-bili-action="userVideos"]', 'click', () => this.loadUserVideos());
            this._on('[data-bili-action="liveStatus"]', 'click', () => this.loadLiveStatus());
        },

        _on: function (selector, type, handler) {
            const element = this.window.querySelector(selector);
            if (!element) return;
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, element, type, handler);
            } else {
                element.addEventListener(type, handler);
            }
        },

        _bindCard: function (element, item) {
            const handler = () => {
                if (item && (item.bvid || item.aid)) {
                    this.playVideo(item);
                } else {
                    this.currentVideo = item;
                    this._renderDetail(item);
                    this._setStatus('该条目暂无可嵌入播放的视频 ID');
                }
            };
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, element, 'click', handler);
            } else {
                element.addEventListener('click', handler);
            }
        },

        _proxyUrl: function (action, params = {}) {
            let url;
            if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) {
                url = SystemInformation.buildServiceUrlObject(this.proxyPath);
            } else {
                url = new URL(this.proxyPath, window.location.origin);
            }
            url.searchParams.set('action', action);
            Object.keys(params).forEach((key) => {
                const value = params[key];
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            });
            return url.toString();
        },

        _request: async function (action, params) {
            const response = await fetch(this._proxyUrl(action, params), {
                method: 'GET',
                headers: { Accept: 'application/json' }
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || data.status !== 'success') {
                throw new Error((data && data.message) || `请求失败: HTTP ${response.status}`);
            }
            return data.data;
        },

        _setStatus: function (message, isError) {
            const status = this.window.querySelector('[data-bili-status]');
            if (!status) return;
            status.textContent = message || '';
            status.classList.toggle('is-error', !!isError);
        },

        _setActiveNav: function (name) {
            this.currentView = name;
            const activeName = name === 'movieRanking' ? 'movie' : name;
            this.window.querySelectorAll('.bili-rail > button').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.biliAction === activeName);
            });
        },

        _setHero: function (title, subtitle, kicker) {
            const titleEl = this.window.querySelector('[data-bili-title]');
            const subtitleEl = this.window.querySelector('[data-bili-subtitle]');
            const kickerEl = this.window.querySelector('[data-bili-kicker]');
            if (titleEl) titleEl.textContent = title || '哔哩哔哩';
            if (subtitleEl) subtitleEl.textContent = subtitle || '';
            if (kickerEl) kickerEl.textContent = kicker || '高仿信息流';
        },

        _renderWelcome: function () {
            const detail = this.window.querySelector('[data-bili-detail]');
            if (!detail) return;
            detail.innerHTML = [
                '<div class="bili-detail-placeholder">',
                '  <strong>欢迎来到 ZerOS 哔哩哔哩</strong>',
                '  <span>左侧切换分区，中间浏览视频，右侧播放与查看详情。</span>',
                '</div>'
            ].join('');
        },

        _normalizeVideo: function (raw) {
            if (!raw) return null;
            const owner = raw.owner || {};
            const stat = raw.stat || {};
            return {
                title: this._stripHtml(raw.title || raw.name || '未命名视频'),
                desc: this._stripHtml(raw.desc || raw.description || raw.dynamic || ''),
                bvid: raw.bvid || '',
                aid: raw.aid || raw.id || '',
                cid: raw.cid || (raw.pages && raw.pages[0] && raw.pages[0].cid) || '',
                pic: this._normalizeHttpsUrl(raw.pic || raw.cover || ''),
                author: owner.name || raw.author || raw.uname || '未知 UP',
                mid: owner.mid || raw.mid || '',
                duration: raw.duration || 0,
                pubdate: raw.pubdate || raw.created || 0,
                stat: {
                    view: stat.view ?? raw.play ?? 0,
                    like: stat.like ?? 0,
                    coin: stat.coin ?? 0,
                    favorite: stat.favorite ?? 0,
                    danmaku: stat.danmaku ?? raw.video_review ?? 0,
                    reply: stat.reply ?? 0
                },
                raw
            };
        },

        _stripHtml: function (text) {
            return String(text || '')
                .replace(/<[^>]+>/g, '')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'");
        },

        _normalizeHttpsUrl: function (url) {
            if (!url) return '';
            const value = String(url).trim();
            if (value.startsWith('//')) return `https:${value}`;
            if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`;
            return value;
        },

        _formatCount: function (value) {
            const num = Number(value) || 0;
            if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
            if (num >= 10000) return (num / 10000).toFixed(num >= 100000 ? 0 : 1) + '万';
            return String(num);
        },

        _formatDuration: function (seconds) {
            const value = Number(seconds) || 0;
            const min = Math.floor(value / 60);
            const sec = value % 60;
            return `${min}:${String(sec).padStart(2, '0')}`;
        },

        _formatDate: function (timestamp) {
            const value = Number(timestamp) || 0;
            if (!value) return '未知时间';
            const date = new Date(value * 1000);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        },

        _renderList: function (items, title, subtitle) {
            const list = this.window.querySelector('[data-bili-list]');
            if (!list) return;
            this.currentList = items.filter(Boolean);
            list.innerHTML = '';
            this._setHero(title, subtitle || `共 ${this.currentList.length} 条内容`, 'ZerOS Native');

            if (this.currentList.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'bili-list-empty';
                empty.textContent = '没有找到内容';
                list.appendChild(empty);
                return;
            }

            this.currentList.forEach((item, index) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'bili-video-card';
                card.innerHTML = [
                    '<span class="bili-cover">',
                    item.pic ? `  <img src="${this._escapeAttr(item.pic)}" alt="" referrerpolicy="no-referrer" />` : '  <span class="bili-video-cover-placeholder">bili</span>',
                    `  <em>${this._escapeHtml(this._formatDuration(item.duration))}</em>`,
                    '</span>',
                    '<span class="bili-video-card-body">',
                    `  <strong>${this._escapeHtml(item.title)}</strong>`,
                    '  <span class="bili-card-meta">',
                    `    <span>${this._escapeHtml(item.author)}</span>`,
                    `    <span>${this._formatCount(item.stat.view)}播放</span>`,
                    `    <span>${this._formatCount(item.stat.danmaku)}弹幕</span>`,
                    '  </span>',
                    `  <small>#${index + 1} · ${this._formatDate(item.pubdate)}</small>`,
                    '</span>'
                ].join('');
                this._bindCard(card, item);
                list.appendChild(card);
            });
        },

        _escapeHtml: function (value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        _escapeAttr: function (value) {
            return this._escapeHtml(value).replace(/`/g, '&#96;');
        },

        _playerFrame: function () {
            return this.window ? this.window.querySelector('[data-bili-player]') : null;
        },

        _playerUrl: function (video) {
            const params = new URLSearchParams({
                autoplay: '0',
                high_quality: '1',
                danmaku: '0',
                mute: '1',
                page: '1'
            });
            if (video.bvid) {
                params.set('bvid', video.bvid);
            } else if (video.aid) {
                params.set('aid', video.aid);
            }
            return `https://player.bilibili.com/player.html?${params.toString()}`;
        },

        playVideo: async function (video) {
            if (!video || (!video.bvid && !video.aid)) return;
            try {
                this._setStatus(`加载 ${video.title} ...`);
                const detailResult = await this._request('view', video.bvid ? { bvid: video.bvid } : { aid: video.aid });
                const detail = detailResult && detailResult.code === 0 ? this._normalizeVideo(detailResult.data) : video;
                this.currentVideo = detail || video;

                const iframe = this._playerFrame();
                if (iframe) iframe.src = this._playerUrl(this.currentVideo);
                const empty = this.window.querySelector('[data-bili-empty]');
                if (empty) empty.style.display = 'none';

                this._renderDetail(this.currentVideo);
                this._setStatus('播放中');
            } catch (error) {
                this._setStatus(error.message || '视频加载失败', true);
                this._log('error', '播放视频失败', error);
            }
        },

        _renderDetail: function (video) {
            const detail = this.window.querySelector('[data-bili-detail]');
            if (!detail || !video) return;
            detail.innerHTML = [
                `<h2>${this._escapeHtml(video.title)}</h2>`,
                '<div class="bili-meta">',
                `  <span>UP ${this._escapeHtml(video.author)}</span>`,
                `  <span>${this._formatDate(video.pubdate)}</span>`,
                `  <span>${this._formatDuration(video.duration)}</span>`,
                '</div>',
                '<div class="bili-stats">',
                `  <span>播放 ${this._formatCount(video.stat.view)}</span>`,
                `  <span>点赞 ${this._formatCount(video.stat.like)}</span>`,
                `  <span>投币 ${this._formatCount(video.stat.coin)}</span>`,
                `  <span>收藏 ${this._formatCount(video.stat.favorite)}</span>`,
                `  <span>弹幕 ${this._formatCount(video.stat.danmaku)}</span>`,
                '</div>',
                `<p>${this._escapeHtml(video.desc || '暂无简介')}</p>`,
                '<div class="bili-detail-actions">',
                '  <button type="button" data-bili-detail-action="tags">标签</button>',
                '  <button type="button" data-bili-detail-action="comments">热评</button>',
                '  <button type="button" data-bili-detail-action="danmaku">弹幕 XML</button>',
                '</div>',
                '<pre class="bili-extra" data-bili-extra></pre>'
            ].join('');

            ['tags', 'comments', 'danmaku'].forEach((action) => {
                const btn = detail.querySelector(`[data-bili-detail-action="${action}"]`);
                if (!btn) return;
                if (typeof EventManager !== 'undefined' && this.pid) {
                    EventManager.registerElementEvent(this.pid, btn, 'click', () => this.loadExtra(action));
                } else {
                    btn.addEventListener('click', () => this.loadExtra(action));
                }
            });
        },

        loadExtra: async function (type) {
            if (!this.currentVideo) return;
            const box = this.window.querySelector('[data-bili-extra]');
            if (!box) return;
            box.textContent = '加载中...';
            try {
                let data;
                if (type === 'tags') {
                    data = await this._request('tags', this.currentVideo.bvid ? { bvid: this.currentVideo.bvid } : { aid: this.currentVideo.aid });
                } else if (type === 'comments') {
                    data = await this._request('comments', { aid: this.currentVideo.aid });
                } else {
                    data = await this._request('danmaku', { cid: this.currentVideo.cid });
                }
                box.textContent = JSON.stringify(data && data.data !== undefined ? data.data : data, null, 2);
            } catch (error) {
                box.textContent = error.message || '加载失败';
            }
        },

        loadPopular: async function () {
            await this._loadVideoList('popular', { pageSize: 24 }, (data) => data.data && data.data.list, '热门视频', '来自 B 站热门 API 的实时内容');
        },

        loadWeekly: async function () {
            await this._loadVideoList('weekly', { number: 1 }, (data) => data.data && data.data.list, '每周必看', '官方每周精选高能视频');
        },

        loadPrecious: async function () {
            await this._loadVideoList('precious', { pageSize: 24 }, (data) => data.data && data.data.list, '入站必刷', '适合新用户补课的经典内容');
        },

        loadMovieRanking: async function () {
            await this._loadVideoList('movieRanking', {}, (data) => data.result && data.result.list, '影视热播', 'PGC 榜单内容，可查看详情但部分条目不可嵌入播放', (item) => ({
                title: item.title,
                desc: item.new_ep ? item.new_ep.index_show : '',
                bvid: '',
                aid: '',
                cid: '',
                pic: this._normalizeHttpsUrl(item.cover),
                author: item.badge || '番剧/影视',
                duration: 0,
                pubdate: 0,
                stat: { view: 0, like: 0, coin: 0, favorite: 0, danmaku: 0, reply: 0 },
                raw: item
            }));
        },

        search: async function (keyword) {
            await this._loadVideoList('search', { keyword, pageSize: 24 }, (data) => data.data && data.data.result, `搜索：${keyword}`, '搜索结果来自 B 站视频搜索 API');
        },

        loadUserVideos: async function () {
            const input = this.window.querySelector('[data-bili-uid]');
            const uid = input ? input.value.trim() : '';
            if (!uid) {
                this._setStatus('请输入 UP 主 UID', true);
                return;
            }
            await this._loadVideoList('userVideos', { uid, pageSize: 20 }, (data) => data.data && data.data.list && data.data.list.vlist, `UP ${uid} 最近投稿`, '按发布时间排序');
        },

        loadLiveStatus: async function () {
            const input = this.window.querySelector('[data-bili-uid]');
            const uid = input ? input.value.trim() : '';
            if (!uid) {
                this._setStatus('请输入 UP 主 UID', true);
                return;
            }
            try {
                this._setStatus('查询直播状态...');
                const data = await this._request('liveStatus', { uid });
                const room = data && data.data;
                const detail = this.window.querySelector('[data-bili-detail]');
                if (detail) {
                    detail.innerHTML = [
                        '<h2>直播状态</h2>',
                        `<p>UID：${this._escapeHtml(uid)}</p>`,
                        `<p>状态：${room && room.liveStatus === 1 ? '开播中' : '未开播'}</p>`,
                        `<p>标题：${this._escapeHtml((room && room.title) || '无')}</p>`,
                        room && room.cover ? `<img class="bili-live-cover" src="${this._escapeAttr(this._normalizeHttpsUrl(room.cover))}" alt="" referrerpolicy="no-referrer" />` : ''
                    ].join('');
                }
                this._setHero(`UP ${uid} 直播状态`, '直播数据来自 live.bilibili.com 接口', 'Live');
                this._setStatus('直播状态已更新');
            } catch (error) {
                this._setStatus(error.message || '直播状态查询失败', true);
            }
        },

        _loadVideoList: async function (action, params, pickList, title, subtitle, customMapper) {
            try {
                this._setActiveNav(action);
                this._setStatus('加载中...');
                const data = await this._request(action, params);
                const rawList = pickList(data) || [];
                const mapper = customMapper || ((item) => this._normalizeVideo(item));
                this._renderList(rawList.map(mapper), title, subtitle);
                this._setStatus(`已加载 ${rawList.length} 条内容`);
            } catch (error) {
                this._setStatus(error.message || '加载失败', true);
                this._renderList([], '加载失败', '请稍后重试或检查 BilibiliProxy.php');
                this._log('error', `${action} 加载失败`, error);
            }
        },

        _log: function (level, message, data) {
            if (typeof KernelLogger === 'undefined') return;
            const logger = KernelLogger[level] || KernelLogger.info;
            logger.call(KernelLogger, 'Bilibili', message, data);
        }
    };

    window.BILIBILI = BILIBILI;
})(window);
