(function() {
    'use strict';

    var container = null;
    var cat = null;
    var catBody = null;
    var catHead = null;
    var catEyes = [];
    var catTail = null;
    var rafId = null;
    var config = {};
    var mouseX = 0;
    var mouseY = 0;
    var isPetting = false;
    var petCount = 0;
    var currentAction = 'idle';
    var actionTimer = null;
    var blinkTimer = null;
    var tailAngle = 0;
    var tailDirection = 1;
    var containerRect = null;

    var colorMap = {
        orange: { body: '#ff9f43', stripe: '#e67e22', eyes: '#feca57' },
        black: { body: '#2d3436', stripe: '#636e72', eyes: '#55efc4' },
        white: { body: '#dfe6e9', stripe: '#b2bec3', eyes: '#74b9ff' },
        gray: { body: '#b2bec3', stripe: '#636e72', eyes: '#a29bfe' },
        calico: { body: '#ffffff', spots: ['#ff9f43', '#2d3436'], eyes: '#feca57' }
    };

    var api = {
        init: function(options) {
            container = options.container;
            config = options.config || {};

            var size = config.catSize || 120;
            var color = colorMap[config.catColor] || colorMap.orange;

            createCat(size, color);
            setupEvents();
            startBlinking();
            startAutoAction();
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
            if (actionTimer) {
                clearTimeout(actionTimer);
                actionTimer = null;
            }
            if (blinkTimer) {
                clearTimeout(blinkTimer);
                blinkTimer = null;
            }
            if (container) {
                container.innerHTML = '';
            }
            container = null;
            cat = null;
        }
    };

    function createCat(size, color) {
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;background:transparent;';

        cat = document.createElement('div');
        cat.style.cssText = 'position:absolute;bottom:20%;left:50%;transform:translateX(-50%);width:' + size + 'px;height:' + size + 'px;cursor:pointer;transition:transform 0.3s ease;';

        catBody = document.createElement('div');
        catBody.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:' + (size * 0.7) + 'px;background:' + color.body + ';border-radius:' + (size * 0.4) + 'px ' + (size * 0.4) + 'px ' + (size * 0.3) + 'px ' + (size * 0.3) + 'px;';

        if (color.spots) {
            color.spots.forEach(function(spotColor, i) {
                var spot = document.createElement('div');
                spot.style.cssText = 'position:absolute;width:' + (size * 0.15) + 'px;height:' + (size * 0.15) + 'px;background:' + spotColor + ';border-radius:50%;top:' + (size * 0.1 + i * size * 0.15) + 'px;left:' + (size * 0.2 + i * size * 0.2) + 'px;';
                catBody.appendChild(spot);
            });
        }

        var belly = document.createElement('div');
        belly.style.cssText = 'position:absolute;bottom:' + (size * 0.1) + 'px;left:50%;transform:translateX(-50%);width:' + (size * 0.5) + 'px;height:' + (size * 0.35) + 'px;background:#fff;opacity:0.6;border-radius:50%;';
        catBody.appendChild(belly);

        catHead = document.createElement('div');
        catHead.style.cssText = 'position:absolute;top:-' + (size * 0.45) + 'px;left:50%;transform:translateX(-50%);width:' + (size * 0.7) + 'px;height:' + (size * 0.6) + 'px;background:' + color.body + ';border-radius:50% 50% 45% 45%;';

        var ears = document.createElement('div');
        ears.style.cssText = 'position:absolute;top:-' + (size * 0.15) + 'px;width:100%;height:' + (size * 0.3) + 'px;';
        ears.innerHTML = '<div style="position:absolute;left:0;width:0;height:0;border-left:' + (size * 0.15) + 'px solid transparent;border-right:' + (size * 0.15) + 'px solid transparent;border-bottom:' + (size * 0.25) + 'px solid ' + color.body + ';"></div><div style="position:absolute;right:0;width:0;height:0;border-left:' + (size * 0.15) + 'px solid transparent;border-right:' + (size * 0.15) + 'px solid transparent;border-bottom:' + (size * 0.25) + 'px solid ' + color.body + ';"></div>';
        catHead.appendChild(ears);

        var face = document.createElement('div');
        face.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80%;height:60%;';

        var eyeContainer = document.createElement('div');
        eyeContainer.style.cssText = 'display:flex;justify-content:space-around;margin-bottom:' + (size * 0.05) + 'px;';

        for (var i = 0; i < 2; i++) {
            var eye = document.createElement('div');
            eye.style.cssText = 'width:' + (size * 0.12) + 'px;height:' + (size * 0.15) + 'px;background:#fff;border-radius:50%;position:relative;overflow:hidden;';
            var pupil = document.createElement('div');
            pupil.style.cssText = 'position:absolute;top:30%;left:30%;width:60%;height:60%;background:' + color.eyes + ';border-radius:50%;';
            eye.appendChild(pupil);
            eyeContainer.appendChild(eye);
            catEyes.push({ eye: eye, pupil: pupil });
        }
        face.appendChild(eyeContainer);

        var nose = document.createElement('div');
        nose.style.cssText = 'width:' + (size * 0.06) + 'px;height:' + (size * 0.04) + 'px;background:#ff6b81;border-radius:50%;margin:0 auto;';
        face.appendChild(nose);

        var mouth = document.createElement('div');
        mouth.style.cssText = 'width:' + (size * 0.1) + 'px;height:' + (size * 0.05) + 'px;border:2px solid #333;border-top:none;border-radius:0 0 50% 50%;margin:' + (size * 0.02) + 'px auto 0;';
        face.appendChild(mouth);

        catHead.appendChild(face);

        catTail = document.createElement('div');
        catTail.style.cssText = 'position:absolute;bottom:' + (size * 0.5) + 'px;right:-' + (size * 0.2) + 'px;width:' + (size * 0.4) + 'px;height:' + (size * 0.1) + 'px;background:' + color.body + ';border-radius:' + (size * 0.2) + 'px;transform-origin:left center;';

        cat.appendChild(catTail);
        cat.appendChild(catBody);
        cat.appendChild(catHead);
        container.appendChild(cat);
    }

    function setupEvents() {
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mouseup', onMouseUp);
        container.addEventListener('mouseleave', onMouseLeave);
    }

    function onMouseMove(e) {
        containerRect = container.getBoundingClientRect();
        mouseX = e.clientX - containerRect.left;
        mouseY = e.clientY - containerRect.top;

        if (!isPetting && catHead) {
            var catRect = cat.getBoundingClientRect();
            var catCenterX = catRect.left + catRect.width / 2 - containerRect.left;
            var catCenterY = catRect.top + catRect.height * 0.3 - containerRect.top;
            var dx = mouseX - catCenterX;
            var maxOffset = 8;
            var offsetX = Math.max(-maxOffset, Math.min(maxOffset, dx / 20));
            catHead.style.transform = 'translateX(calc(-50% + ' + offsetX + 'px))';
        }

        catEyes.forEach(function(eyeObj, i) {
            var eyeRect = eyeObj.eye.getBoundingClientRect();
            var eyeCenterX = eyeRect.left + eyeRect.width / 2 - containerRect.left;
            var eyeCenterY = eyeRect.top + eyeRect.height / 2 - containerRect.top;
            var dx = (mouseX - eyeCenterX) / 20;
            var dy = (mouseY - eyeCenterY) / 20;
            var maxOffset = 3;
            dx = Math.max(-maxOffset, Math.min(maxOffset, dx));
            dy = Math.max(-maxOffset, Math.min(maxOffset, dy));
            eyeObj.pupil.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        });
    }

    function onMouseDown(e) {
        isPetting = true;
        petCount++;
        setAction('happy');
        if (cat) {
            cat.style.transform = 'translateX(-50%) scale(1.05)';
        }
    }

    function onMouseUp() {
        isPetting = false;
        if (cat) {
            cat.style.transform = 'translateX(-50%) scale(1)';
        }
        setAction('idle');
    }

    function onMouseLeave() {
        isPetting = false;
        setAction('idle');
    }

    function setAction(action) {
        currentAction = action;
        if (actionTimer) {
            clearTimeout(actionTimer);
        }
        actionTimer = setTimeout(function() {
            if (config.autoAction !== false) {
                var actions = ['idle', 'looking', 'stretching'];
                var randomAction = actions[Math.floor(Math.random() * actions.length)];
                setAction(randomAction);
            }
        }, 2000 + Math.random() * 3000);
    }

    function startBlinking() {
        function blink() {
            catEyes.forEach(function(eyeObj) {
                eyeObj.eye.style.height = '2px';
                eyeObj.eye.style.top = (eyeObj.eye.parentElement.offsetTop + 8) + 'px';
            });
            setTimeout(function() {
                catEyes.forEach(function(eyeObj) {
                    var size = config.catSize || 120;
                    eyeObj.eye.style.height = (size * 0.15) + 'px';
                    eyeObj.eye.style.top = '';
                });
            }, 150);
        }
        blinkTimer = setInterval(blink, 3000 + Math.random() * 2000);
    }

    function startAutoAction() {
        if (config.autoAction !== false) {
            setAction('idle');
        }
    }

    function animate() {
        if (catTail) {
            tailAngle += tailDirection * 2;
            if (tailAngle > 30 || tailAngle < -30) {
                tailDirection *= -1;
            }
            catTail.style.transform = 'rotate(' + tailAngle + 'deg)';
        }
        rafId = requestAnimationFrame(animate);
    }

    if (typeof window !== 'undefined') {
        window.WALLPAPER_RUN = api;
    }
    return api;
})();
