/**
 * 粒子追随鼠标 - 壁纸 run.js
 * 实现 init / start / stop 生命周期，粒子平滑追随鼠标；参数来自 config.json。
 * @see PAPER-FORMAT.md
 */
(function () {
    'use strict';

    // --- 状态 ---
    var rafId = null;
    var container = null;
    var canvas = null;
    var ctx = null;
    var particles = [];
    var config = {};
    var width = 0;
    var height = 0;
    var mouseX = 0;
    var mouseY = 0;
    var targetX = 0;
    var targetY = 0;
    var boundMove = null;
    var boundEnter = null;

    function getOpt(cfg, key, def) {
        if (cfg && typeof cfg[key] !== 'undefined') return cfg[key];
        return def;
    }

    function createParticle() {
        var sizeMin = getOpt(config, 'particleSizeMin', 1);
        var sizeMax = getOpt(config, 'particleSizeMax', 4);
        var size = sizeMin + Math.random() * (sizeMax - sizeMin);
        return {
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0,
            vy: 0,
            size: size,
            tx: 0,
            ty: 0
        };
    }

    function tick() {
        if (!ctx || !canvas) return;
        var w = canvas.width;
        var h = canvas.height;
        if (w < 2 || h < 2) {
            rafId = requestAnimationFrame(tick);
            return;
        }
        var followSpeed = getOpt(config, 'followSpeed', 0.08);
        var smoothness = getOpt(config, 'smoothness', 0.85);
        var showTrail = getOpt(config, 'showTrail', true);
        var trailAlpha = Math.max(0.08, Math.min(0.35, getOpt(config, 'trailAlpha', 0.14)));
        var bg = getOpt(config, 'backgroundColor', '#0f0f1a');
        var color = getOpt(config, 'particleColor', '#7c3aed');
        var opacity = getOpt(config, 'particleOpacity', 0.85);

        targetX += (mouseX - targetX) * (1 - smoothness);
        targetY += (mouseY - targetY) * (1 - smoothness);

        if (showTrail) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = bg;
            ctx.globalAlpha = trailAlpha;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = bg;
            ctx.globalAlpha = 1;
            ctx.fillRect(0, 0, w, h);
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.tx = targetX;
            p.ty = targetY;
            p.vx += (p.tx - p.x) * followSpeed;
            p.vy += (p.ty - p.y) * followSpeed;
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.x += p.vx;
            p.y += p.vy;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        rafId = requestAnimationFrame(tick);
    }

    function resize() {
        if (!canvas || !container) return;
        width = container.clientWidth || window.innerWidth;
        height = container.clientHeight || window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        var n = Math.max(10, Math.min(300, getOpt(config, 'particleCount', 80)));
        while (particles.length < n) particles.push(createParticle());
        particles.length = n;
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            if (p.x === undefined || p.y === undefined) {
                p.x = Math.random() * width;
                p.y = Math.random() * height;
            }
            p.tx = p.x;
            p.ty = p.y;
        }
    }

    function setupMouse() {
        boundMove = function (e) {
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            mouseX = Math.max(0, Math.min(rect.width || width, x));
            mouseY = Math.max(0, Math.min(rect.height || height, y));
        };
        boundEnter = function () {
            targetX = mouseX;
            targetY = mouseY;
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('mousemove', boundMove);
            window.addEventListener('mouseenter', boundEnter);
            window.addEventListener('resize', resize);
        }
        if (canvas) canvas.addEventListener('mousemove', boundMove);
        if (typeof document !== 'undefined' && document.body) document.body.style.cursor = 'none';
    }

    function teardownMouse() {
        if (typeof document !== 'undefined' && document.body) document.body.style.cursor = '';
        if (typeof window !== 'undefined') {
            if (boundMove) window.removeEventListener('mousemove', boundMove);
            if (boundEnter) window.removeEventListener('mouseenter', boundEnter);
            window.removeEventListener('resize', resize);
        }
        if (canvas && boundMove) {
            try { canvas.removeEventListener('mousemove', boundMove); } catch (e) {}
        }
        boundMove = null;
        boundEnter = null;
    }

    var api = {
        init: function (options) {
            config = (options && options.config) || {};
            container = (options && options.container) || null;
            if (!container) return;
            canvas = document.createElement('canvas');
            canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:none;';
            container.appendChild(canvas);
            ctx = canvas.getContext('2d');
            width = container.clientWidth || 300;
            height = container.clientHeight || 200;
            targetX = width / 2;
            targetY = height / 2;
            mouseX = targetX;
            mouseY = targetY;
            resize();
        },
        start: function () {
            if (!container || !canvas) return;
            width = container.clientWidth || 300;
            height = container.clientHeight || 200;
            targetX = width / 2;
            targetY = height / 2;
            mouseX = targetX;
            mouseY = targetY;
            resize();
            setupMouse();
            var bg = getOpt(config, 'backgroundColor', '#0f0f1a');
            if (ctx && canvas) {
                ctx.fillStyle = bg;
                ctx.globalAlpha = 1;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1;
            }
            rafId = requestAnimationFrame(tick);
        },
        stop: function () {
            if (rafId != null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            teardownMouse();
            particles = [];
            if (container) container.innerHTML = '';
            canvas = null;
            ctx = null;
            container = null;
        }
    };

    if (typeof window !== 'undefined') window.WALLPAPER_RUN = api;
    return api;
})();
