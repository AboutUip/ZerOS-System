/**
 ************************************************************************
 * ice.run(代码运行)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-07-02
 * 更新：2022-04-27
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */
'use strict';
var ice = ice || {};
ice.run = function(options){
	options = options || {};
	var inc = {
		css:'',
		style:options.style != undefined ? options.style : '',
		js:'',
		headTopHtml:options.headTopHtml != undefined ? options.headTopHtml : '',
		headBottomHtml:options.headBottomHtml != undefined ? options.headBottomHtml : '',
		bodyTopJs:'',
		bodyBottomJs:'',
		bodyTopHtml:options.bodyTopHtml != undefined ? options.bodyTopHtml : '',
		bodyBottomHtml:options.bodyBottomHtml != undefined ? options.bodyBottomHtml : '',
	}
	if(options.css && options.css.length){
		ice.each(options.css,function(){
			inc.css += '<link type="text/css" rel="stylesheet" href="'+this+'"/>';
		})
	}
	if(options.js && options.js.length){
		ice.each(options.js,function(){
			inc.js += '<script src="'+this+'"></script>';
		})
	}
	if(options.bodyTopJs && options.bodyTopJs.length){
		ice.each(options.bodyTopJs,function(){
			inc.bodyTopJs += '<script src="'+this+'"></script>';
		})
	}
	if(options.bodyBottomJs && options.bodyBottomJs.length){
		ice.each(options.bodyBottomJs,function(){
			inc.bodyBottomJs += '<script src="'+this+'"></script>';
		})
	}
	function codeInit(html) {
		html = html.replace(/\t/g,'    ');
		html = html.split('\n');
		if(html.length>0){
			var str = '';
			//去除首尾空行
			var init = function(html){
				var h = [];
				var y; //是否有数据
				for (var i = 0; i < html.length; i++){
					if(html[i].trim().length){
						y = 1;
						h.push(html[i]);
					}else{
						y = y === 1 ? 1 : 0;
						if(y) h.push(html[i]);
					}
				}
				return h;
			}
			var h = init(html);
			h = init(h.reverse());
			h = h.reverse();
			if(!h.length) return {html:'',line:1,count:0};
			str = h[0];
			var s = str.match(/\s+/);
			if(s && s.length > 0){
				s = s[0];
				for (var i = 0; i < h.length; i++){
					h[i] = h[i].replace(s,'');
				}
			}
		}
		return h.join('\n');
	}

	//创建父级div
	var div = ice.c('div');
	div.className = 'run-examples ani-right-in';
	div.innerHTML = `
		<div class="run-header">
			<div class="run-close">✕</div>
			<div class="run-title">代码示例</div>
			<div class="run-ok">运行代码</div>
			<div class="run-reset">重置</div>
		</div>
		<div class="run-main">
			<div class="run-code">
				<textarea></textarea>
				<div class="run-move"></div>
			</div>
			<div class="run-iframe"></div>
		</div>
		<div class="run-footer">
			<div class="run-info">line ：<span class="run-line">1</span></div>
			<div class="run-info">length ：<span class="run-count">0</span></div>
			<div class="run-info">sel ：<span class="run-sel">0</span></div>
		</div>
	`;
	document.body.appendChild(div);
	var line = ice('.run-line',div)[0];
	var count = ice('.run-count',div)[0];
	var sel = ice('.run-sel',div)[0];
	
	var iframeBox = ice('.run-iframe',div)[0];
	var textarea = ice('textarea',div)[0];
	var stats = function(){
		line.innerHTML = textarea.value.split('\n').length;
		count.innerHTML = textarea.value.length;
	};
	var range = document.createRange ? window.getSelection() : document.selection.createRange();

	//支持tab键
	textarea.onkeydown = function(e) {
		if (e.keyCode == 9) {
			e.preventDefault();
			var indent = '    ';
			var start = this.selectionStart;
			var end = this.selectionEnd;
			var selected = window.getSelection().toString();
			selected = indent + selected.replace(/\n/g, '\n' + indent);
			this.value = this.value.substring(0, start) + selected + this.value.substring(end);
			this.setSelectionRange(start + indent.length, start + selected.length);
		}
		stats();
	}
	textarea.oninput = function(e) {
		stats();
	}
	textarea.onkeyup = function(e) {
    	sel.innerHTML = range.toString().length;
	}
	textarea.onmousedown=function(){
		window.onmousemove=function(){
			sel.innerHTML = range.toString().length;
		}
		window.onmouseup = function(){
			window.onmousemove = null;
			window.onmouseup = null;
			setTimeout(function(){
				sel.innerHTML = range.toString().length;
			},50);
		}
	}
	window.onmousedown=function(){
		sel.innerHTML = 0;
	}

	var codeBox = ice('.run-code',div)[0];
	var mainBox = ice('.run-main',div)[0];

	//创建iframe
	var iframe = ice.c('iframe');
	iframe.frameBorder=0;
	iframeBox.appendChild(iframe);

	//获取iframe对象
	var d = iframe.contentDocument; //获取iframe documen 对象
	var content = '';
	var setValue = function(content){
		d.open();
		d.write(`
			<html>
				<head>
					${inc.headTopHtml}
					<link type="text/css" rel="stylesheet" href="/iceui/src/ui/ui.css"/>
					<link type="text/css" rel="stylesheet" href="/iceui/src/ui/page.css"/>
					${inc.css}
					<script src="/iceui/src/ice.js"></script>
					<script src="/iceui/src/ui/ui.js"></script>
					${inc.js}
					<style>body{margin:30px;background:#fff;}${inc.style}</style>
					${inc.headBottomHtml}
				</head>
				<body>
					${inc.bodyTopJs}
					${inc.bodyTopHtml}
					${content}
					${inc.bodyBottomHtml}
					${inc.bodyBottomJs}
				</body>
			</html>`
		);
		d.close();
	};

	var move = ice('.run-move',div)[0];
	//拖拽改变大小
	move.onmousedown=function(e){
		ice(mainBox).addCss('run-shade');
		var x = e.clientX;
		var ws = codeBox.offsetWidth;
		var iw = iframe.offsetWidth;
		window.onmousemove=function(){
			var xs = e.clientX - x;
			var w = xs + ws;
			if(w >= 360 && iw - xs >=200) codeBox.style.width = w + 'px';
		}
		window.onmouseup = function(){window.onmousemove = null;window.onmouseup = null;ice(mainBox).delCss('run-shade');}
	}
	ice('.run-close',div).click(function(){
		ice(div).fadeOut();
	})
	ice('.run-ok',div).click(function(){
		setValue(textarea.value);
	})
	ice('.run-reset',div).click(function(){
		textarea.value = content;
		setValue(content);
		stats();
	})
	ice.eachNode(window.document, function () {
		let id = ice(this).attr('data-run');
		let show = ice(this).attr('data-show');
		if(id){
			let code = ice(id);
			if(code.length){
				this.onclick = function(){
					content = codeInit(code.html());
					textarea.value = content;
					setValue(content);
					stats();
					ice(div).show();
				}
			}
		}
		if(show){
			let code = ice(show);
			this.innerHTML = code.html();
			ui && ui.init();
		}
	});
};
(function(){var a = document.createElement('style');a.innerHTML = `
.run-examples textarea::-webkit-scrollbar{height:8px;width:8px;}
.run-examples textarea::-webkit-scrollbar-corner{background-color:transparent;}
.run-examples textarea::-webkit-scrollbar-thumb{background-color:#aeaeae;}
.run-examples textarea::-webkit-scrollbar-track{background-color:transparent;}
.run-examples{background:#fff;width:80%;height:100%;position:fixed;margin:auto;right:0;top:0;bottom:0;z-index:9999;box-sizing:border-box;box-shadow:0 0 50px rgba(0,0,0,0.35);display:none;}
.run-header{height:35px;line-height:35px;background:#ffffff;border-bottom:1px solid #f4f4f4;}
.run-title{padding:0 10px;display:inline-block;margin-right:20px;}
.run-close{padding:0px 10px;cursor:pointer;display:inline-block;}
.run-main{width:100%;height:calc(100% - 65px);display:flex;justify-content:space-between;position:relative;}
.run-code{width: 40%;background:#eee;height:100%;border-right:1px solid #e7e7e7;position:relative;}
.run-code textarea{color:#2e2e2e;font-size: 14px;font-weight:normal;font-family: "Consolas","Microsoft YaHei","Bitstream Vera Sans Mono","Courier New"!important;width:100%;height:100%;padding:30px;border:none;background: #f7f7f0;resize:none;line-height: 18px;}
.run-code pre{color:#c0cbdd;font-size:13px;font-family:serif;font-family:"Consolas","Microsoft YaHei","Bitstream Vera Sans Mono","Courier New"!important;width:100%;height:100%;padding:30px;border:none;background:#38404e;resize:none;}
.run-code .iceCode-main{height:calc(100% - 32px);}
.run-iframe{flex: 1;position: relative;}
.run-iframe iframe{width:100%;height:100%;}
.run-main.run-shade::after{content:'';position:absolute;left:0;top:0;background:transparent;width:100%;height:100%;z-index: 99;}
.run-ok,.run-reset{display:inline-block;background:#8BC34A;padding:0 15px;height:24px;line-height:24px;color:#fff;border-radius:2px;font-size:13px;margin-right:5px;cursor:pointer;transition:all .3s;}
.run-ok:hover{background:#7ab239;}
.run-reset{background:#FF9800;}
.run-reset:hover{background:#e48800;}
.run-footer{color: rgba(255, 255, 255, 0.79);width:100%;height:30px;line-height:30px;background: #38404e;position:absolute;left:0;bottom:0;padding:0 10px;}
.run-info{display:inline-block;font-size:13px;font-weight: normal;margin-right:20px;}
.run-info span{font-weight:bold;}
.run-move{position:absolute;right:-6px;top:0;bottom:0;margin:auto 0;background:#38404e;width:6px;height:50px;cursor:w-resize;z-index: 999;}
`;document.getElementsByTagName('head')[0].appendChild(a);})();