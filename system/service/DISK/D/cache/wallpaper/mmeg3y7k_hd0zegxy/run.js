(function() {
    'use strict';

    var container = null;
    var timeEl = null;
    var catEl = null;
    var butterflyEl = null;
    var rafId = null;
    var config = {};
    var pupil1 = null;
    var pupil2 = null;
    var isMouseOverCat = false;

    var api = {
        init: function(options) {
            container = options.container;
            config = options.config || {};

            var fontSize = config.fontSize || 72;
            var textColor = config.textColor || '#ffffff';
            var bgColor = config.bgColor || '#1e3a8a';
            var catColor = config.catColor || '#ffffff';
            var butterflyColor = config.butterflyColor || '#fbbf24';

            container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:' + bgColor + ';';

            createClock(fontSize, textColor);
            createButterfly(butterflyColor);
            createCat(catColor);

            updateTime();
        },

        start: function() {
            if (!rafId) {
                rafId = setInterval(updateTime, 1000);
            }
        },

        stop: function() {
            if (rafId) {
                clearInterval(rafId);
                rafId = null;
            }
            if (container) {
                container.innerHTML = '';
            }
            container = null;
        }
    };

    function createClock(fontSize, textColor) {
        timeEl = document.createElement('div');
        timeEl.style.cssText = 'position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:' + fontSize + 'px;font-family:sans-serif;font-weight:300;color:' + textColor + ';letter-spacing:8px;';
        container.appendChild(timeEl);
    }

    function createButterfly(color) {
        butterflyEl = document.createElement('div');
        butterflyEl.style.cssText = 'position:absolute;top:40px;right:40px;width:40px;height:40px;pointer-events:none;transform-origin:center center;';
        
        var butterflySVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        butterflySVG.setAttribute('width', '40');
        butterflySVG.setAttribute('height', '40');
        butterflySVG.setAttribute('viewBox', '0 0 40 40');
        
        var path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M20,10 C25,15 30,10 35,15 C30,20 25,25 20,20 C15,25 10,20 5,15 C10,10 15,15 20,10 Z');
        path1.setAttribute('stroke', color);
        path1.setAttribute('fill', 'none');
        path1.setAttribute('stroke-width', '1');
        
        var path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M20,10 C25,5 30,10 35,5 C30,10 25,15 20,10 C15,15 10,10 5,5 C10,10 15,5 20,10 Z');
        path2.setAttribute('stroke', color);
        path2.setAttribute('fill', 'none');
        path2.setAttribute('stroke-width', '1');
        
        butterflySVG.appendChild(path1);
        butterflySVG.appendChild(path2);
        butterflyEl.appendChild(butterflySVG);
        container.appendChild(butterflyEl);
        
        container.addEventListener('mousemove', function(e) {
            var rect = container.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            // 蝴蝶跟随鼠标
            butterflyEl.style.left = (x - 20) + 'px';
            butterflyEl.style.top = (y - 20) + 'px';
            
            // 蝴蝶方向跟随鼠标
            var butterflyRect = butterflyEl.getBoundingClientRect();
            var butterflyX = butterflyRect.left + butterflyRect.width / 2;
            var butterflyY = butterflyRect.top + butterflyRect.height / 2;
            var angle = Math.atan2(e.clientY - butterflyY, e.clientX - butterflyX) * 180 / Math.PI;
            butterflyEl.style.transform = 'rotate(' + angle + 'deg)';
            
            // 猫咪眼睛跟随鼠标
            if (pupil1 && pupil2) {
                var catRect = catEl.getBoundingClientRect();
                var catX = catRect.left + catRect.width / 2;
                var catY = catRect.top + catRect.height / 2;
                
                // 计算瞳孔移动的比例
                var maxPupilMove = 1.5; // 最大移动距离
                var dx = (e.clientX - catX) / (rect.width / 2) * maxPupilMove;
                var dy = (e.clientY - catY) / (rect.height / 2) * maxPupilMove;
                
                // 限制移动范围
                dx = Math.max(-maxPupilMove, Math.min(maxPupilMove, dx));
                dy = Math.max(-maxPupilMove, Math.min(maxPupilMove, dy));
                
                // 更新瞳孔位置
                pupil1.setAttribute('cx', 112.5 + dx);
                pupil1.setAttribute('cy', 90 + dy);
                pupil2.setAttribute('cx', 187.5 + dx);
                pupil2.setAttribute('cy', 90 + dy);
            }
        });
    }

    function createCat(color) {
        catEl = document.createElement('div');
        catEl.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);text-align:center;cursor:pointer;';
        
        var catSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        catSVG.setAttribute('width', '300');
        catSVG.setAttribute('height', '180');
        catSVG.setAttribute('viewBox', '0 0 300 180');
        
        // 猫咪头部路径
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M75,30 C75,15 105,0 135,0 C165,0 195,0 225,15 C255,30 255,60 255,90 C255,120 225,150 195,150 C180,150 150,150 135,150 C120,150 90,150 75,150 C45,150 15,120 15,90 C15,60 15,30 75,30 Z');
        path.setAttribute('stroke', color);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '4');
        
        // 耳朵
        var ear1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ear1.setAttribute('d', 'M105,30 L75,-30 L120,0 Z');
        ear1.setAttribute('stroke', color);
        ear1.setAttribute('fill', 'none');
        ear1.setAttribute('stroke-width', '4');
        
        var ear2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ear2.setAttribute('d', 'M195,30 L165,-30 L210,0 Z');
        ear2.setAttribute('stroke', color);
        ear2.setAttribute('fill', 'none');
        ear2.setAttribute('stroke-width', '4');
        
        // 眼睛
        var eye1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye1.setAttribute('cx', '112.5');
        eye1.setAttribute('cy', '90');
        eye1.setAttribute('r', '18');
        eye1.setAttribute('fill', '#000000');
        
        var eye2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        eye2.setAttribute('cx', '187.5');
        eye2.setAttribute('cy', '90');
        eye2.setAttribute('r', '18');
        eye2.setAttribute('fill', '#000000');
        
        // 瞳孔
        pupil1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pupil1.setAttribute('cx', '112.5');
        pupil1.setAttribute('cy', '90');
        pupil1.setAttribute('r', '6');
        pupil1.setAttribute('fill', '#ffffff');
        
        pupil2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pupil2.setAttribute('cx', '187.5');
        pupil2.setAttribute('cy', '90');
        pupil2.setAttribute('r', '6');
        pupil2.setAttribute('fill', '#ffffff');
        
        // 桌面线
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', '165');
        line.setAttribute('x2', '300');
        line.setAttribute('y2', '165');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '3');
        
        catSVG.appendChild(path);
        catSVG.appendChild(ear1);
        catSVG.appendChild(ear2);
        catSVG.appendChild(eye1);
        catSVG.appendChild(eye2);
        catSVG.appendChild(pupil1);
        catSVG.appendChild(pupil2);
        catSVG.appendChild(line);
        
        catEl.appendChild(catSVG);
        container.appendChild(catEl);
        
        // 添加鼠标事件
        catEl.addEventListener('mousedown', function() {
            isMouseOverCat = true;
            // 眯眼效果
            pupil1.setAttribute('r', '0.5');
            pupil2.setAttribute('r', '0.5');
        });
        
        catEl.addEventListener('mouseup', function() {
            isMouseOverCat = false;
            // 恢复正常眼睛
            pupil1.setAttribute('r', '2');
            pupil2.setAttribute('r', '2');
        });
        
        catEl.addEventListener('mouseleave', function() {
            isMouseOverCat = false;
            // 恢复正常眼睛
            pupil1.setAttribute('r', '2');
            pupil2.setAttribute('r', '2');
        });
    }

    function updateTime() {
        var now = new Date();
        var hours = String(now.getHours()).padStart(2, '0');
        var minutes = String(now.getMinutes()).padStart(2, '0');
        var timeString = hours + ':' + minutes;
        if (timeEl) {
            timeEl.textContent = timeString;
        }
    }

    if (typeof window !== 'undefined') {
        window.WALLPAPER_RUN = api;
    }
    return api;
})();
