/**
 * 浏览器程序内代理 Service Worker：仅代理本程序 iframe 发出的请求。
 * 与 proxy.php 同目录，通过 referrer 含 proxy.php 判断请求来自浏览器 iframe。
 */
(function() {
    'use strict';
    self.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
    });
    const scriptUrl = self.location.href;
    const base = scriptUrl.replace(/browser-proxy-sw\.js(\?.*)?$/i, '');
    const PROXY_URL = base + 'proxy.php';
    const PROXY_PAGE_MARKER = 'proxy.php';

    function isSameOrigin(url) {
        try {
            const u = new URL(url);
            return u.origin === self.location.origin;
        } catch (e) {
            return false;
        }
    }

    function shouldProxy(url) {
        try {
            const u = new URL(url);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
            return !isSameOrigin(url);
        } catch (e) {
            return false;
        }
    }

    /** 仅当请求来自「通过 proxy.php 打开的页面」（浏览器 iframe）时才代理 */
    function isFromBrowserProxyPage(referrer) {
        if (!referrer || referrer.length === 0) return false;
        return referrer.indexOf(PROXY_PAGE_MARKER) !== -1;
    }

    function isProxyNavigation(url) {
        return url.indexOf(PROXY_PAGE_MARKER) !== -1 && url.indexOf('url=') !== -1;
    }

    self.addEventListener('fetch', function(event) {
        const req = event.request;
        const url = req.url;

        // 导航到代理页：放行，不改写，否则主文档无法加载
        if (req.mode === 'navigate' && isProxyNavigation(url)) {
            return;
        }

        // 只代理「浏览器程序」内发出的请求：referrer 必须包含 proxy.php
        if (!isFromBrowserProxyPage(req.referrer)) {
            return;
        }

        // 同源请求放行
        if (isSameOrigin(url)) {
            return;
        }

        // 仅代理 http(s) 跨域请求
        if (!shouldProxy(url)) {
            return;
        }

        const proxyTarget = PROXY_URL + (PROXY_URL.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(url);
        const init = {
            method: req.method,
            headers: req.headers,
            mode: 'cors',
            credentials: req.credentials
        };
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
            init.body = req.body;
        }

        function isCollectUrl(u) {
            return /\/log\//.test(u)
                || /data\.bilibili\.com.*log/.test(u)
                || /cm\.bilibili\.com\/cm\/api\//.test(u)
                || /api\.bilibili\.com\/x\/internal\/gaia-gateway\//.test(u)
                || /api\.bilibili\.com\/x\/report\//.test(u)
                || /api\.bilibili\.com\/x\/web-frontend\/data\/collector/.test(u)
                || /api\.bilibili\.com\/bapis\/bilibili\.api\.ticket\.v1\.Ticket\/GenWebTicket/.test(u);
        }
        function isOptionalDataUrl(u) {
            return isCollectUrl(u)
                || /manga\.bilibili\.com\/twirp\//.test(u);
        }
        function isImageUrl(u) {
            return /\.(png|jpe?g|gif|webp|avif|svg)(@[^/?#]*)?(\?|#|$)/i.test(u)
                || /\/bfs\/(sycp|vc|archive|face|article|static|svg-next)\//i.test(u);
        }
        function isJsonUrl(u) {
            return /\.json(\?|#|$)/i.test(u);
        }
        function emptyJsonResponse() {
            return new Response(JSON.stringify({
                code: 0,
                message: '0',
                data: {
                    feeds: [],
                    items: [],
                    list: [],
                    cards: [],
                    modules: [],
                    result: []
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        function transparentImageResponse() {
            const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
            const binary = atob(png);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Response(bytes, {
                status: 200,
                headers: { 'Content-Type': 'image/png' }
            });
        }
        event.respondWith(fetch(proxyTarget, init).then(function(res) {
            // 代理返回 5xx 时，采集类请求统一当 200 空体，避免 bili-collect 等刷 502
            if (res.status >= 500 && isOptionalDataUrl(url)) {
                return emptyJsonResponse();
            }
            if (res.status >= 500 && (isImageUrl(url) || req.destination === 'image')) {
                return transparentImageResponse();
            }
            if (res.status >= 500 && isJsonUrl(url)) {
                return emptyJsonResponse();
            }
            return res;
        }).catch(function(err) {
            if (isOptionalDataUrl(url) || isJsonUrl(url)) {
                return emptyJsonResponse();
            }
            if (isImageUrl(url) || req.destination === 'image') {
                return transparentImageResponse();
            }
            return new Response('', { status: 502, statusText: 'Proxy error' });
        }));
    });
})();
