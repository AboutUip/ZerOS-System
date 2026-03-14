(function() {
    'use strict';

    var container = null;
    var clockEl = null;
    var dateEl = null;
    var signatureEl = null;
    var jsonBg = null;
    var rafId = null;
    var config = {};
    var jsonLines = [];

    var api = {
        init: function(options) {
            container = options.container;
            config = options.config || {};

            var fontSize = config.fontSize || 72;
            var fontFamily = config.fontFamily || 'monospace';
            var textColor = config.textColor || '#00ff88';
            var bgOpacity = config.bgOpacity || 0.15;
            var signature = config.signature || '萱';
            var showDate = config.showDate !== false;

            jsonBg = document.createElement('div');
            jsonBg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;opacity:' + bgOpacity + ';font-family:' + fontFamily + ';font-size:14px;color:#4a5568;line-height:1.5;padding:20px;box-sizing:border-box;white-space:pre-wrap;word-break:break-all;pointer-events:none;';
            container.appendChild(jsonBg);

            generateJsonBackground();

            var clockContainer = document.createElement('div');
            clockContainer.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;';

            clockEl = document.createElement('div');
            clockEl.style.cssText = 'font-size:' + fontSize + 'px;font-family:' + fontFamily + ';color:' + textColor + ';font-weight:bold;letter-spacing:8px;text-shadow:0 0 20px ' + textColor + ',0 0 40px ' + textColor + ';';
            clockContainer.appendChild(clockEl);

            if (showDate) {
                dateEl = document.createElement('div');
                dateEl.style.cssText = 'font-size:20px;font-family:' + fontFamily + ';color:' + textColor + ';opacity:0.7;margin-top:10px;letter-spacing:4px;';
                clockContainer.appendChild(dateEl);
            }

            signatureEl = document.createElement('div');
            signatureEl.style.cssText = 'font-size:16px;font-family:' + fontFamily + ';color:' + textColor + ';opacity:0.5;margin-top:30px;letter-spacing:2px;';
            signatureEl.textContent = signature;
            clockContainer.appendChild(signatureEl);

            container.appendChild(clockContainer);
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
            clockEl = null;
            dateEl = null;
            signatureEl = null;
            jsonBg = null;
            container = null;
            jsonLines = [];
        }
    };

    function generateJsonBackground() {
        if (!jsonBg) return;

        var keywords = ['"name"', '"type"', '"value"', '"data"', '"time"', '"date"', '"status"', '"id"', '"count"', '"size"', '"mode"', '"key"', '"config"', '"options"', '"default"'];
        var values = ['true', 'false', 'null', '0', '1', '[]', '{}', '"value"', '"item"'];

        jsonLines = [];
        for (var i = 0; i < 50; i++) {
            var line = '';
            var indent = Math.floor(Math.random() * 4);
            for (var j = 0; j < indent; j++) line += '  ';

            if (Math.random() > 0.5) {
                line += keywords[Math.floor(Math.random() * keywords.length)];
                line += ': ';
                line += values[Math.floor(Math.random() * values.length)];
            } else {
                line += '// ' + ['timestamp', 'data', 'config', 'status', 'cache'][Math.floor(Math.random() * 5)];
            }
            jsonLines.push(line);
        }

        jsonBg.textContent = jsonLines.join('\n');
    }

    function updateTime() {
        var now = new Date();
        var hours = String(now.getHours()).padStart(2, '0');
        var minutes = String(now.getMinutes()).padStart(2, '0');
        var seconds = String(now.getSeconds()).padStart(2, '0');

        if (clockEl) {
            clockEl.textContent = hours + ':' + minutes + ':' + seconds;
        }

        if (dateEl) {
            var year = now.getFullYear();
            var month = String(now.getMonth() + 1).padStart(2, '0');
            var day = String(now.getDate()).padStart(2, '0');
            var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            var weekDay = weekDays[now.getDay()];
            dateEl.textContent = year + '-' + month + '-' + day + ' 星期' + weekDay;
        }
    }

    if (typeof window !== 'undefined') {
        window.WALLPAPER_RUN = api;
    }
    return api;
})();
