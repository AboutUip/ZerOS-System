(function() {
    'use strict';

    var container = null;
    var canvas = null;
    var ctx = null;
    var rafId = null;
    var particles = [];
    var mouseX = 0;
    var mouseY = 0;
    var mouseActive = false;
    var width = 0;
    var height = 0;
    var config = {};
    var colorPalettes = {
        rainbow: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'],
        blue: ['#00d2d3', '#01a3a4', '#2e86de', '#54a0ff', '#5f27cd', '#c8d6e5'],
        purple: ['#a55eea', '#8854d0', '#6c5ce7', '#a29bfe', '#dfe6e9', '#fd79a8'],
        warm: ['#ffeaa7', '#fab1a0', '#ff7675', '#fd9644', '#fc5c65', '#eb3b5a'],
        white: ['#ffffff', '#dfe6e9', '#b2bec3', '#636e72', '#2d3436', '#ffffff']
    };

    var api = {
        init: function(options) {
            container = options.container;
            config = options.config || {};

            var particleCount = config.particleCount || 150;
            var connectDistance = config.connectDistance || 120;
            var speed = config.speed || 1.5;
            var particleSize = config.particleSize || 2;
            var mouseInfluence = config.mouseInfluence || 0.08;

            canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

            ctx = canvas.getContext('2d');
            container.appendChild(canvas);

            resize();
            window.addEventListener('resize', resize);
            container.addEventListener('mousemove', onMouseMove);
            container.addEventListener('mouseenter', function() { mouseActive = true; });
            container.addEventListener('mouseleave', function() { mouseActive = false; });

            initParticles(particleCount);
        },

        start: function() {
            if (!rafId) {
                animate();
            }
        },

        stop: function() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (canvas && container) {
                canvas.remove();
                container.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('resize', resize);
            }
            particles = [];
            canvas = null;
            ctx = null;
            container = null;
        }
    };

    function resize() {
        if (!canvas) return;
        width = container.clientWidth;
        height = container.clientHeight;
        canvas.width = width;
        canvas.height = height;
    }

    function onMouseMove(e) {
        var rect = container.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        mouseActive = true;
    }

    function initParticles(count) {
        particles = [];
        for (var i = 0; i < count; i++) {
            particles.push(createParticle());
        }
    }

    function createParticle(x, y) {
        var speed = config.speed || 1.5;
        var size = config.particleSize || 2;
        return {
            x: x !== undefined ? x : Math.random() * width,
            y: y !== undefined ? y : Math.random() * height,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            size: size + Math.random() * size * 0.5,
            baseSize: size,
            hue: Math.random() * 360,
            brightness: 0.5 + Math.random() * 0.5
        };
    }

    function getColor(hue, alpha) {
        var mode = config.colorMode || 'rainbow';
        var palette = colorPalettes[mode] || colorPalettes.rainbow;
        var index = Math.floor((hue / 360) * palette.length);
        var hex = palette[index % palette.length];

        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);

        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function animate() {
        if (!ctx) return;

        ctx.fillStyle = 'rgba(10, 10, 20, 0.15)';
        ctx.fillRect(0, 0, width, height);

        var connectDistance = config.connectDistance || 120;
        var mouseInfluence = config.mouseInfluence || 0.08;
        var speed = config.speed || 1.5;

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];

            if (mouseActive) {
                var dx = mouseX - p.x;
                var dy = mouseY - p.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0 && dist < 300) {
                    var force = mouseInfluence * (1 - dist / 300);
                    p.vx += dx * force * 0.1;
                    p.vy += dy * force * 0.1;
                }
            }

            p.vx += (Math.random() - 0.5) * 0.1;
            p.vy += (Math.random() - 0.5) * 0.1;

            var maxSpeed = speed * 2;
            var currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (currentSpeed > maxSpeed) {
                p.vx = (p.vx / currentSpeed) * maxSpeed;
                p.vy = (p.vy / currentSpeed) * maxSpeed;
            }

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            p.hue += 0.5;
            if (p.hue > 360) p.hue = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = getColor(p.hue, p.brightness);
            ctx.fill();
        }

        ctx.lineWidth = 1;
        for (var i = 0; i < particles.length; i++) {
            for (var j = i + 1; j < particles.length; j++) {
                var p1 = particles[i];
                var p2 = particles[j];
                var dx = p1.x - p2.x;
                var dy = p1.y - p2.y;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < connectDistance) {
                    var alpha = (1 - dist / connectDistance) * 0.4;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = getColor((p1.hue + p2.hue) / 2, alpha);
                    ctx.stroke();
                }
            }
        }

        rafId = requestAnimationFrame(animate);
    }

    if (typeof window !== 'undefined') {
        window.WALLPAPER_RUN = api;
    }
    return api;
})();
