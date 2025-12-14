'use strict';
/**
 ************************************************************************
 * ice.popup(弹出层)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-07-02
 * 更新：2022-06-06
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */

var ice = ice || {};
ice.popup = function(options) {
    options = options || {};
    var width = options.width || '400px'; //默认宽度
    width = typeof width === 'number' ? width+'px' : width;
    var height = options.height || '270px'; //默认高度
    height = typeof height === 'number' ? height+'px' : height;
    var title = options.title || false; //默认不显示标题
    var content = options.content || ''; //默认内容
    var time = options.time || false; //默认不自动关闭弹窗
    var background = options.background !== undefined ? options.background : true; //是否显示背景
    var animate = options.animate || 'ani-up-in'; //弹窗的动画
    var position = options.position || 0; //弹窗的位置
    var color = options.color || false; //弹窗的主题颜色
    var disable = options.disable || [];
    var close = options.close !== undefined ? options.close : true;
    var btn = options.btn !== undefined ? options.btn : ['取消','确认'];
    var yes = options.yes || false;
    var no = options.no || false;
    var footer = options.footer !== undefined ? options.footer : '';
    var success = options.success || false;
    var webWidth = window.innerWidth;
    var webHeight = window.innerHeight;
    var box = ice('#_popup');
    var popup = ice.c('div');
    popup.className = 'popup';
    if(box.length){
        //创建子级div
        box.append(popup);
    }else{
        //创建父级div，方便管理所有弹窗
        box = ice.c('div');
        box.id = '_popup';
        box.appendChild(popup);
        document.body.appendChild(box);
    }

    //高度尺寸计算
    var contentCss = btn ? ' popup-foot' : '';

    //创建按钮
    var btnHtml = '';
    if (btn) for (var i = 0, b; b = btn[i++];) {
        btnHtml += '<a href="javascript:;" class="popup-btn">' + b + '</a>';
    }

    //创建模型
    var html = '';
    if (background) {
        html += '<div class="popup-bg"></div>';
    }
    html += '<div class="popup-box ' + animate + contentCss + '" style="width:' + width + ';height:' + height + ';">';
    if (title) {
        color = color ? 'bg-'+color : '';
        var closeHtml = close ? '<div class="popup-close"></div>' : '';
        html += '<div class="popup-header ' + color + '"><div class="popup-title">' + title + '</div>'+ closeHtml +'</div>';
    }
    if (options.url) {
        html += '<iframe src="'+options.url+'" frameborder="0" scrolling="auto" sandbox="allow-same-origin allow-top-navigation allow-forms allow-scripts"></iframe>';
    } else {
        html += '<div class="popup-content">' + (typeof content == 'function' ? content() : content) + '</div>';
    }
    if (btn) {
        html += '<div class="popup-footer"><div class="popup-footer-content">'+ (typeof footer == 'function' ? footer() : footer) +'</div><div class="popup-menu">' + btnHtml + '</div></div>';
    }
    html += '<div class="popup-resize"></div></div>';

    //type:1叉号，2取消，3确定，4回调
    var close = function(type) {
        if(type === 1 || type === 2){
            if(!disable.includes('no')){
                ice(popup).del()
            }
        }
        if(type === 3){
            if(!disable.includes('yes')){
                ice(popup).del()
            }
        }
        if(type === 4){
            ice(popup).del()
        }
    }; 
    popup.close = function(){
        close(4)
    };       
    popup.innerHTML = html;
    var obj = ice('.popup-box',popup);
    if (title) {
        var header = ice('.popup-header',popup);
        header.addCss('popup-move');
        header[0].onmousedown = function(ev) {
            var oEvent = ev || event,
                x = oEvent.clientX - obj[0].offsetLeft,
                y = oEvent.clientY - obj[0].offsetTop;
            document.onmousemove = function(ev) {
                oEvent = ev || event;
                obj[0].style.left = oEvent.clientX - x + 'px';
                obj[0].style.top = oEvent.clientY - y + 'px';
                obj[0].style.right = 'initial';
                obj[0].style.bottom = 'initial';
            };
            document.onmouseup = function() {
                document.onmousemove = null;
                document.onmouseup = null;
            };
            return false;
        };
        header.find('.popup-close').click(function() {
            no && no(popup);
            close(1);
            return false;
        })
    }

    var resize = ice(popup).find('.popup-resize')[0];
    //拖拽改变大小
    resize.onmousedown = function(ev) {
        var e = ev || event,
            x = e.clientX - obj[0].offsetWidth,
            y = e.clientY - obj[0].offsetHeight;
            // obj[0].style.left = obj[0].offsetLeft+'px';
            // obj[0].style.top = obj[0].offsetTop+'px';
            // obj[0].style.margin = 0;
        document.onmousemove = function(ev) {
            e = ev || event;
            var w = e.clientX - x, h = e.clientY - y;
            if(w > 260) obj[0].style.width = w + 'px';
            if(h > 180) obj[0].style.height = h + 'px';
        };
        document.onmouseup = function() {
            document.onmousemove = null;
            document.onmouseup = null;
        };
        return false;
    };

    var btnObj = ice(popup).find('.popup-btn');
    if (btnObj[0]) btnObj[0].onclick = function() {
        no && no(popup);
        close(2);
    }
    if (btnObj[1]) btnObj[1].onclick = function() {
        if (yes && yes(popup)===false){
            return;
        }
        close(3);
    }
    if (!btnObj[1] && btnObj[0]) btnObj[0].onclick = function() {
        if (yes && yes(popup)===false){
            return;
        }
        close(3);
    }

    //弹窗对齐方式
    switch (position) {
    case 't':
        //顶部居中对齐
        obj.css({
            top : 0,
            left : webWidth / 2 - obj[0].offsetWidth / 2 + 'px',
            right : 'initial',
            bottom : 'initial'
        })
        break;
    case 'b':
        //底部居中对齐
        obj.css({
            bottom : 0,
            left : webWidth / 2 - obj[0].offsetWidth / 2 + 'px',
            right : 'initial',
            top : 'initial'
        })
        break;
    case 'l':
        //左边垂直对齐
        obj.css({
            left : 0,
            top : webHeight / 2 - obj[0].offsetHeight / 2 + 'px',
            right : 'initial',
            bottom : 'initial'
        })
        break;
    case 'r':
        //右边垂直对齐
        obj.css({
            right : 0,
            top : webHeight / 2 - obj[0].offsetHeight / 2 + 'px',
            left : 'initial',
            bottom : 'initial'
        })
        break;
    case 'lt':
        //左上角垂直对齐
        obj.css({
            left : 0,
            top : 0,
            right : 'initial',
            bottom : 'initial'
        })
        break;
    case 'lb':
        //左下角垂直对齐
        obj.css({
            left : 0,
            bottom : 0,
            right : 'initial',
            top : 'initial'
        })
        break;
    case 'rt':
        //右上角垂直对齐
        obj.css({
            right : 0,
            top : 0,
            left : 'initial',
            bottom : 'initial'
        })
        break;
    case 'rb':
        //右下角垂直对齐
        obj.css({
            right : 0,
            bottom : 0,
            left : 'initial',
            top : 'initial'
        })
        break;
    default:
        //默认垂直水平对齐
        break;
    }
    if (time) {
        setTimeout(function(){close(1)}, time);
    }
    ui.init();
    success && success(popup);
};
//提示
ice.prompt = function (options) {
    if (typeof options == 'string') options = { content: options };
    options = options || {};
    var title = options.title || '温馨提示'; //默认不显示标题
    var content = options.content || '未定义'; //默认内容
    var time = options.time || false; //默认不自动关闭弹窗
    var btn = options.btn !== undefined ? options.btn : ['取消','确认'];
    var yes = options.yes || false;
    var no = options.no || false;
    var getTime = new Date().getTime();
    var id_prompt = '_prompt' + getTime;
    var id_close = '_close' + getTime;
    var id_footer = '_footer' + getTime;

    //创建父级div，方便管理所有弹窗
    var prompt = ice.c('div');
    prompt.className = 'prompt';
    document.body.appendChild(prompt);

    //创建按钮
    var btnHtml = '';
    if (btn) for (var i = 0, b; b = btn[i++];) {
        btnHtml += '<span class="a-line">' + b + '</span>';
    }

    //创建模型
    var html = '';
    html += '<div class="prompt-box ani-up-in" id="' + id_prompt + '">';
    html += '<div class="prompt-close" id="' + id_close + '">✕</div>';
    html += '<div class="prompt-title">「' + title + '」</div>';
    html += '<div class="prompt-content">' + content + '</div>';
    html += '<div class="prompt-footer" id="' + id_footer + '">' + btnHtml + '</div>';
    html += '</div>';

    //输出模型
    prompt.innerHTML = html;
    var promptBox = document.getElementById(id_prompt);
    var delT;

    //定义关闭事件
    var close = function () {
        promptBox.className = 'prompt-box ani-up-out';
        setTimeout(function () {
            if(prompt)prompt.parentNode.removeChild(prompt);
        }, 400);
    }
    document.getElementById(id_close).onclick = function () {
        clearTimeout(delT);
        if (no) (no)();
        close();
        return false;
    }
    if (time) {
        delT = setTimeout(close, time);
    }
    var btnObj = document.getElementById(id_footer).getElementsByTagName('span');
    if(btnObj.length){
        if (btnObj[0]) btnObj[0].onclick = function () {
            close();
            if (no) (no)();
        }
        if (btnObj[1]) btnObj[1].onclick = function () {
            close();
            if (yes) (yes)();
        }
        if (!btnObj[1] && btnObj[0]) btnObj[0].onclick = function () {
            close();
            if (yes) (yes)();
        }
    }
};
//成功提示框
ice.success = function (msg, url, time = 2000) {
    ice.pop({ content: msg, icon: 'success', url: url, time: time });
}
//失败提示框
ice.fail = function (msg, url, time = 2000) {
    ice.pop({ content: msg, icon: 'fail', url: url, time: time });
}
//警告提示框
ice.warn = function (msg, url, time = 2000) {
    ice.pop({ content: msg, icon: 'warning', url: url, time: time });
}
//错误提示框
ice.error = function (msg, url, time = 2000) {
    ice.pop({ content: msg, icon: 'fail', url: url, time: time });
}
//提示框
ice.pop = function (options, icon = false, time = 2000) {
    var pop = ice('#pop');
    if(pop.length){
        clearTimeout(pop[0].t);
        pop.del();
    }
    if (typeof options == 'string') {
        if(typeof icon == 'function'){
            options = { content: options, icon: false, time: time, callback: icon };
        }else{
            options = { content: options, icon: icon, time: time };
        }
    }
    var content = options.content || 0;
    var icon = options.icon || icon;
    var url = options.url || 0;
    var time = options.time || time;
    var callback = options.callback || function () { };
    //内置图标列表
    var iconList = {
        default: 'ice-face',
        success: 'ice-check-line',
        fail: 'ice-close-line',
        warning: 'ice-about',
        ask: 'ice-help',
        none: false,
    };
    icon = iconList[icon];
    //创建对象
    var div = ice.c('div');
    div.id = 'pop';
    div.className = 'pop ani-up-in';
    var iconHtml = icon ? '<div class="pop-icon"><i class="icon ' + icon + '"></i></div>' : '';
    div.innerHTML = iconHtml + '<div class="pop-title">' + content + '</div>';
    document.body.appendChild(div);
    div.t = setTimeout(function () {
        ice(div).addCss('ani-down-out');
        setTimeout(function () {
            ice.del(div);
            if (url) location.href = url;
            callback();
        }, 500);
    }, time);
};
//小弹窗
ice.alert = function(options, yes, no){
    if (typeof options == 'string'){
        options = { content: options, btn: ['确认'] };
        if (yes || no) options.btn = 0;
        if (yes) options.yes = yes;
        if (no) options.no = no;
    }
    if (!options.content) return;
    var btn = options.btn || ['取消', '确认'];
    var el = ice.c('div');
    el.className = 'alert';
    document.body.appendChild(el);
    var btnHtml = '<div class="alert-confirm">确定</div><div class="alert-cancel">取消</div>';
    if (btn){
        if (btn[0]) btnHtml = `<div class="alert-confirm">${btn[0]}</div>`;
        if (btn[1]) btnHtml = `<div class="alert-cancel">${btn[0]}</div><div class="alert-confirm">${btn[1]}</div>`;
    }
    el.innerHTML = `<div class="alert-bg"></div>
    <div class="alert-box ani-up-in">
        <div class="alert-content">${options.content}</div>
        <div class="alert-footer">
            ${btnHtml}
        </div>
    </div>`;
    ice('.alert-confirm', el).click(function(){
        ice(el).del();
        options.yes && options.yes();
    });
    ice('.alert-cancel', el).click(function(){
        ice(el).del();
        options.no && options.no();
    });
    ice(el).show();
};
//小弹窗
ice.notes = function(options,content){
    var el;
    if(typeof options === 'object' && !options.content && content !== undefined){
        el = ice(options);
        options = {content:content,show:true};
    }else{
        el = options.obj ? ice(options.obj) : ice(options.el);
    }
    if(!el.length) return;
    if (options.content && options.content.length) {
        var type = options.type ? options.type : 'hover';
        type = type == 'hover' ? 'mouseover' : 'click';
        var position = options.position ? options.position : 'top';
        var div = ice.c('div');
        div.className = 'notes notes-' + position + ' ani-' + position + '-in';
        div.innerHTML = `<div class="notes-content">${options.content}</div>`;
        var show = function(obj){
            var pos = ice(obj).page();
            var scroll = ice.scroll();
            pos = {
                x: pos.x - scroll.x,
                y: pos.y - scroll.y
            };
            if (position == 'right') {
                div.style.top = pos.y - 16 + 'px';
                div.style.left = obj.offsetWidth + pos.x + 10 + 'px';
            } else if (position == 'left') {
                div.style.top = pos.y - 16 + 'px';
                div.style.left = pos.x - 250 - 10 + 'px';
            } else if (position == 'top') {
                div.style.bottom = ui.webH - pos.y + 16 + 'px';
                div.style.left = pos.x - 16 + 'px';
            } else if (position == 'bottom') {
                div.style.top = pos.y + obj.offsetHeight + 16 + 'px';
                div.style.left = pos.x - 16 + 'px';
            }
            ui.body.append(div);
        };
        if(options.show){
            ice(el).each(function () {
                show(this);
            })
        }else{
            ice(el).on(type, function () {
                if(this.notes) return;
                this.notes = 1;
                show(this);
            })
        }
        ice(el).on('mouseout', function () {
            ice(div).del();
        })
    }
};