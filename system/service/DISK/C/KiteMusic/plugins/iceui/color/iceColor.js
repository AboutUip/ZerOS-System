'use strict';
/**
 ************************************************************************
 * ice.color(颜色选择器)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-11-25
 * 更新：2022-04-27
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */
var ice = ice || {};
/**
 * 颜色选择器
 * @param {Function} callback 回调函数
 */
ice.color = function (callback) {
	class iceColor {
		constructor(callback) {
			var that = this;
			this.callback = callback;
			this.color = {
				h: 360,
				s: 1,
				v: 1,
				a: 1
			};
			this.ev = this.isMobile() ? {
				down: 'ontouchstart',
				move: 'ontouchmove',
				up: 'ontouchend'
			} : {
				down: 'onmousedown',
				move: 'onmousemove',
				up: 'onmouseup'
			};
			this.error = 0;
			this.create();
			this.list = this.getClass('iceColor-simple');
			if(this.list.length){
				for(var i=0;i<this.list.length;i++){
					var el = this.list[i];
					//如果对象为input，监听输入的色值并重新格式化颜色选择器
					if(el.tagName == 'INPUT'){
						el.className = el.className.length ? el.className + ' iceColor-input' : 'iceColor-input';
						el.oninput = function () {
							that.color.a = 1;
							that.setColor(this.value);
						}
					}
					el.onclick = function(e){
						e.stopPropagation();
						that.init(this);
						that.iceColor.onclick = function(e){
							e.stopPropagation();
						};
						document.onclick=function(){
							that.iceColor.style.display = 'none';
						};
					}
					this.el = el;
					this.setColor(el.getAttribute('data-color') || '#4caf50');
				}
			}
			(function run(z){
				var obj = z.getClass('iceColor');
				if(obj.length){
					obj = obj[0];
					//创建元素
					var box = z.createTag('div');
					box.className = 'iceColor-magic';

					var input = z.createTag('input');
					input.type = 'text';
					var name = obj.getAttribute('data-name');
					if(name && name.length) input.name = name;
					//input监听输入的色值并重新格式化颜色选择器
					input.oninput = function () {
						that.color.a = 1;
						that.setColor(this.value);
					}

					var label = z.createTag('label');
					var el = z.createTag('i');
					el.onclick = function(e){
						e.stopPropagation();
						that.init(this);
						that.iceColor.onclick = function(e){
							e.stopPropagation();
						};
						document.onclick=function(){
							that.iceColor.style.display = 'none';
						};
					}
					el.input = input;
					z.el = el;
					z.setColor(obj.getAttribute('data-color') || '#4caf50');
					label.appendChild(el);
					box.appendChild(input);
					box.appendChild(label);
					//替换元素
					obj.parentNode.replaceChild(box,obj);
					if(z.getClass('iceColor').length){
						run(z);
					}
				}
			})(this);
		}
		//初始化
		init(el) {
			this.el = el;
			this.iceColor.style.left = this.page(el).left+'px';
			this.iceColor.style.top = this.page(el).top+'px';
			this.iceColor.style.display = 'block';

			//获取选择器坐标
			this.posX = this.iceColor.offsetLeft;
			this.posY = this.iceColor.offsetTop;
			this.posSX = this.getColorClass('control').offsetLeft;

			//设置颜色
			this.setColor(el.getAttribute('data-color') || '#4caf50');
		}
		//创建颜色选择器
		create() {
			var that = this;
			var html = `
			<div class="iceColor-picker-wrapper">
				<div class="iceColor-picker"><div class="iceColor-picker-bg"><div></div></div></div>
				<div class="iceColor-picker-indicator"></div>
			</div>
			<div class="iceColor-control">
				<div class="iceColor-slide-wrapper"><div class="iceColor-slide"></div><div class="iceColor-slide-indicator"></div></div>
				<div class="iceColor-alpha-wrapper"><div class="iceColor-alpha"></div><div class="iceColor-alpha-indicator"></div></div>
			</div>
			<div class="iceColor-view"></div>
			<div class="iceColor-value">
				<label class="iceColor-active">HEX</label><label>RGB</label><input class="iceColor-value-input" type="text"/>
				<div class="iceColor-sel">
					<span data-color="#f44336" style="background:#f44336"></span><span data-color="#ff9800" style="background:#ff9800"></span><span data-color="#FFC107" style="background:#FFC107"></span><span data-color="#CDDC39" style="background:#CDDC39"></span><span data-color="#8bc34a" style="background:#8bc34a"></span><span data-color="#4caf50" style="background:#4caf50"></span><span data-color="#2196f3" style="background:#2196f3"></span><span data-color="#3F51B5" style="background:#3F51B5"></span><span data-color="#9C27B0" style="background:#9C27B0"></span><span data-color="#E91E63" style="background:#E91E63"></span>
				</div>
				<div class="iceColor-confirm">确认</div>
			</div>`;
			//创建
			this.iceColor = this.createTag('div');
			this.iceColor.className = 'iceColor-main';
			this.iceColor.style.display = 'none';
			this.iceColor.innerHTML = html;
			document.body.appendChild(this.iceColor);

			this.confirm = this.getColorClass('confirm');
			this.confirm.onclick = function(){
				that.iceColor.style.display = 'none';
			}
			
			//颜色选择区
			this.pickerEl = this.getColorClass('picker');
			this.pickerEls = this.getColorClass('picker-wrapper');
			this.pickerDot = this.getColorClass('picker-indicator');
			//颜色选择条
			this.slideEl = this.getColorClass('slide');
			this.slideDot = this.getColorClass('slide-indicator');
			this.slideEls = this.getColorClass('slide-wrapper');
			//透明设置条
			this.alphaEl = this.getColorClass('alpha');
			this.alphaDot = this.getColorClass('alpha-indicator');
			this.alphaEls = this.getColorClass('alpha-wrapper');
			//预置颜色选择
			this.colorSel = this.getColorClass('sel').getElementsByTagName('span');
			for (var i = 0; i < this.colorSel.length; i++) {
				this.colorSel[i].style.background = this.colorSel[i].getAttribute('data-color');
				this.colorSel[i].onclick = function () {
					that.color.a = 1;
					that.setColor(this.getAttribute('data-color'));
				};
			}
			//颜色展示
			this.view = this.getColorClass('view');
			this.input = this.getColorClass('value-input');
			this.input.oninput = function () {
				that.setColor(this.value);
			}
			//选择色值类别
			this.typeList = this.iceColor.getElementsByTagName('label');

			//添加拖动事件
			this.dragPicker(this.pickerEls, this.pickerDot, this.alphaEl);
			this.dragSlide(this.slideEls, this.slideDot, this.slideEl, this.pickerEl, this.alphaEl);
			this.dragAlpha(this.alphaEls, this.alphaDot, this.slideEl, this.alphaEl);
		}
		//创建元素
		createTag (name) {
			return document.createElement(name);
		}
		//获取clsss
		getClass (name) {
			return document.getElementsByClassName(name);
		}
		//获取iceColor中的对象
		getColorClass (name) {
			return this.iceColor.getElementsByClassName('iceColor-' + name)[0];
		}
		//获取导航条的值
		getScroll() {
			return {
				x : document.documentElement.scrollLeft,
				y : document.documentElement.scrollTop
			}
		}
		//获取当前元素的坐标
		page(el) {
			var box = el.getBoundingClientRect(),
				doc = el.ownerDocument,
				body = doc.body,
				html = doc.documentElement,
				clientTop = html.clientTop || body.clientTop || 0,
				clientLeft = html.clientLeft || body.clientLeft || 0,
				top = box.top + (self.pageYOffset || html.scrollTop || body.scrollTop) - clientTop + el.offsetHeight,
				left = box.left + (self.pageXOffset || html.scrollLeft || body.scrollLeft) - clientLeft;
			return {
				'left': left,
				'top': top
			}
		}
		//判断是否为移动端
		isMobile() {
			var mobile = ['Android', 'iPhone', 'SymbianOS', 'WindowsPhone', 'iPad', 'iPod'];
			//根据userAgent判断是否是手机
			for (var v = 0; v < mobile.length; v++)
				if (navigator.userAgent.indexOf(mobile[v]) > 0)
					return true;

			//根据屏幕分辨率判断是否是手机
			if (window.screen.width < 500) return true;
			return false;
		}
		//颜色预览以及成功回调
		colorInit() {
			if (this.error) return;
			this.input.value = this.view.style.backgroundColor = this.color.value;
			if(this.el.tagName == 'INPUT'){
				this.el.value = this.el.style.borderLeftColor = this.color.value;
			}else{
				this.el.style.backgroundColor = this.color.value;
				if(this.el.input){
					this.el.input.value = this.color.value;
					this.el.input.setAttribute('data-color',this.color.value);
				}
			}
			this.el.setAttribute('data-color',this.color.value);
			this.callback && this.callback(this.color,this.el);
		}
		//设置色值类别
		setType(type = 'HEX') {
			var that = this;
			this.color.type = type;
			for (var i = 0; i < this.typeList.length; i++) {
				if (this.typeList[i].innerHTML == type) {
					this.typeList[i].className = 'iceColor-active';
				} else {
					this.typeList[i].className = '';
				}
				this.typeList[i].onclick = function () {
					that.color.type = this.innerHTML;
					if (this.className == 'iceColor-active')
						return;
					that.typeList[0].className = '';
					that.typeList[1].className = '';
					this.className = 'iceColor-active';
					that.color.a = 1;
					if (this.innerHTML == 'HEX') {
						//更新透明设置的小圆点位置
						that.alphaDot.style.left = that.slideEl.offsetWidth - that.alphaDot.offsetWidth / 2 + 'px';
						that.rgbInit(that.input.value, 'HEX')
					} else {
						that.hexInit(that.input.value, 'RGB')
					}
					that.colorInit();
				};
			}
		}
		/**
		 * 以rgb/hex格式设置选择器的颜色。
		 * @param {string} hex或rgb格式
		 */
		setColor(value) {
			//初始化颜色
			if (value[0] == '#') {
				this.setType('HEX');
				this.hexInit(value);
			} else {
				this.setType('RGB');
				this.rgbInit(value);
			}
			if (this.error) return false;

			//颜色区-圆点位置与背景色
			var pickerHeight = this.pickerEl.offsetHeight;
			var mousePicker = {
				x: this.color.s * this.pickerEl.offsetWidth,
				y: pickerHeight - this.color.v * pickerHeight
			};
			var hex = this.hsvInit({
				h: this.color.h,
				s: 1,
				v: 1
			}).hex;
			this.pickerDot.style.left = mousePicker.x - this.pickerDot.offsetWidth / 2 + 'px';
			this.pickerDot.style.top = mousePicker.y - this.pickerDot.offsetHeight / 2 + 'px';
			this.pickerEl.style.backgroundColor = this.color.h == 0 ? '#ff0000' : hex;

			//色相条-圆点位置
			var h = this.color.h == 0 ? 360 : this.color.h;
			var mouseSlide = {
				y: 0,
				x: (h * this.slideEl.offsetWidth) / 360
			};
			this.slideDot.style.left = mouseSlide.x - this.slideDot.offsetWidth / 2 + 'px';

			//透明条-圆点位置与背景色
			this.alphaDot.style.left = this.slideEl.offsetWidth * this.color.a - this.alphaDot.offsetWidth / 2 + 'px';
			this.alphaEl.style.background = 'linear-gradient(to right, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',0) 0%, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',1) 100%)';

			this.colorInit();
			return this.color;
		}
		//颜色选择区
		pickerSet(x, y, pickerEl, alphaEl) {
			var width = pickerEl.offsetWidth,
				height = pickerEl.offsetHeight;
			this.color.s = x / width;
			this.color.v = (height - y) / height;
			this.color = this.hsvInit(this.color);
			//透明度
			alphaEl.style.background = 'linear-gradient(to right, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',0) 0%, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',1) 100%)';
			this.colorInit();
		}
		//色相条
		slideSet(x, slideEl, pickerEl, alphaEl) {
			var h = x / slideEl.offsetWidth * 360;
			var pickerColor = this.hsvInit({
				h: h,
				s: 1,
				v: 1
			});
			this.color.h = h;
			this.color = this.hsvInit(this.color);
			pickerEl.style.backgroundColor = pickerColor.hex;
			//透明度
			alphaEl.style.background = 'linear-gradient(to right, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',0) 0%, rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',1) 100%)';
			this.colorInit();
		}
		/**
		 * 计算hex透明度
		 * @param {Number} x 滚动位置
		 * @param {Number} w 总宽
		 * @param {Boolean} isAlpha 是否直接通过透明度计算
		 * @return {String} hex格式透明度
		 */
		hexAlpha(x, w, isAlpha) {
			var a = Math.trunc(isAlpha ? 255 * this.color.a : 255 * (x / w)).toString(16);
			a = a == 'ff' ? '' : a;
			return a.length == 1 ? '0' + a : a;
		}
		//自动设置rgb格式，如果存在透明度则为rgba
		rgbAuto() {
			this.color.rgb = this.color.a == 1 ? 'rgb(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ')' : 'rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',' + this.color.a + ')';
		}
		//返回滑块的单击事件处理程序 设置颜色透明度
		alphaSet(x, slideEl) {
			this.color.a = Number((x / slideEl.offsetWidth).toFixed(2));
			this.setType('RGB');
			this.rgbAuto();
			this.color.value = this.color.type == 'HEX' ? this.color.hex : this.color.rgb;
			this.colorInit();
		}
		//颜色透明条
		dragAlpha(a, b, slideEl, alphaEl) {
			var that = this;
			a[that.ev.down] = function (ev) {
				var fn = function (l) {
					if (l < 0)
						l = 0;
					if (l > a.offsetWidth)
						l = a.offsetWidth;
					b.style.left = l - b.offsetWidth / 2 + 'px';
					that.alphaSet(l, slideEl, alphaEl);
				};
				var pos = that.getPos(ev,1);
				fn(pos.x);
				document[that.ev.move] = function (ev) {
					pos = that.getPos(ev,1);
					fn(pos.x);
				};
				document[that.ev.up] = function () {
					document[that.ev.move] = null;
					document[that.ev.up] = null;
				};
				return false;
			};
		}
		//颜色选择条
		dragSlide(a, b, slideEl, pickerEl, alphaEl) {
			var that = this;
			a[that.ev.down] = function (ev) {
				var fn = function (l) {
					if (l < 0)
						l = 0;
					if (l > a.offsetWidth)
						l = a.offsetWidth;
					b.style.left = l - b.offsetWidth / 2 + 'px';
					that.slideSet(l, slideEl, pickerEl, alphaEl);
				};
				var pos = that.getPos(ev,1);
				fn(pos.x);
				document[that.ev.move] = function (ev) {
					pos = that.getPos(ev,1);
					fn(pos.x);
				};
				document[that.ev.up] = function () {
					document[that.ev.move] = null;
					document[that.ev.up] = null;
				};
				return false;
			};
		}
		getPos (e,bool) {
			//x：x坐标
			//y：y坐标
			//e：原生事件返回信息
			var x = 0,
				y = 0,
				sx = bool?this.posSX:0,
				p = this.page(this.el);
			if (this.isMobile()) {
				if (e.touches.length) {
					x = e.touches[0].pageX - p.left - sx;
					y = e.touches[0].pageY - p.top;
				}
			} else {
				x = e.clientX + this.getScroll().x - this.posX - sx;
				y = e.clientY + this.getScroll().y - this.posY;
			}
			return {
				x: x,
				y: y,
				e: e
			};
		}
		//颜色选择块
		dragPicker(a, b, alphaEl) {
			var that = this;
			a[that.ev.down] = function (ev) {
				var fn = function (l, t) {
					if (l < 0)
						l = 0;
					if (l > a.offsetWidth)
						l = a.offsetWidth;
					if (t < 0)
						t = 0;
					if (t > a.offsetHeight)
						t = a.offsetHeight;
					b.style.left = l - b.offsetWidth / 2 + 'px';
					b.style.top = t - b.offsetHeight / 2 + 'px';
					that.pickerSet(l, t, a, alphaEl);
				};
				var pos = that.getPos(ev);
				fn(pos.x, pos.y);
				document[that.ev.move] = function (ev) {
					pos = that.getPos(ev);
					fn(pos.x, pos.y);
				};
				document[that.ev.up] = function () {
					document[that.ev.move] = null;
					document[that.ev.up] = null;
				};
				return false;
			};
		}
		//根据hsv初始化
		hsvInit(hsv) {
			var R, G, B, X, C;
			var h = (hsv.h % 360) / 60;

			C = hsv.v * hsv.s;
			X = C * (1 - Math.abs(h % 2 - 1));
			R = G = B = hsv.v - C;

			h = ~~h;
			R += [C, X, 0, 0, X, C][h];
			G += [X, C, C, X, 0, 0][h];
			B += [0, 0, X, C, C, X][h];

			var r = Math.floor(R * 255),
				g = Math.floor(G * 255),
				b = Math.floor(B * 255);
			var color = {
				h: hsv.h,
				s: hsv.s,
				v: hsv.v,
				r: r,
				g: g,
				b: b,
				a: this.color.a,
				rgb: this.color.a == 1 ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + this.color.a + ')',
				hex: "#" + (16777216 | b | (g << 8) | (r << 16)).toString(16).slice(1),
				type: this.color.type,
			};
			color.value = this.color.type == 'HEX' ? color.hex : color.rgb;
			return color;
		}
		//根据rgb色值初始化
		rgbInit(rgb, type = 'RGB') {
			var arr = this.rgb2hex(rgb);
			if (!arr) return false;
			var hsv = this.rgb2hsv(arr);
			Object.assign(this.color, hsv, arr);
			this.color.type = type;
			this.color.value = type == 'HEX' ? this.color.hex : this.color.rgb;
			this.error = 0;
			return this.color;
		}
		//根据hex色值初始化
		hexInit(hex, type = 'HEX') {
			var arr = this.hex2rgb(hex);
			if (!arr) return false;
			var hsv = this.rgb2hsv(arr);
			Object.assign(this.color, hsv, arr, {
				a: this.color.a
			});
			this.rgbAuto();
			this.color.type = type;
			this.color.value = type == 'HEX' ? this.color.hex : this.color.rgb;
			this.error = 0;
			return this.color;
		}
		rgb2hsv(rgb) {
			var r = rgb.r,
				g = rgb.g,
				b = rgb.b;
			if (rgb.r > 0 || rgb.g > 0 || rgb.b > 0) {
				r /= 255;
				g /= 255;
				b /= 255;
			}
			var H, S, V, C;
			V = Math.max(r, g, b);
			C = V - Math.min(r, g, b);
			H = (C == 0 ? null : V == r ? (g - b) / C + (g < b ? 6 : 0) : V == g ? (b - r) / C + 2 : (r - g) / C + 4);
			H = (H % 6) * 60;
			S = C == 0 ? 0 : C / V;
			return {
				h: H,
				s: S,
				v: V
			};
		}
		rgb2hex(val) {
			val = val.replace(/\s+/g, '');
			var r, g, b, a, rgb = val.match(/rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(,([.\d]+))?\)/);
			if (!!rgb) {
				r = (+rgb[1]).toString(16);
				r = r.length == 1 ? '0' + r : r;
				g = (+rgb[2]).toString(16);
				g = g.length == 1 ? '0' + g : g;
				b = (+rgb[3]).toString(16);
				b = b.length == 1 ? '0' + b : b;
				a = (+(rgb[5] ? rgb[5] : 1));
				return {
					r: parseInt(r, 16),
					g: parseInt(g, 16),
					b: parseInt(b, 16),
					a: a,
					hex: '#' + r + g + b,
					rgb: val
				};
			}
			this.error = 1;
			return false;
		}
		hex2rgb(val) {
			val = val.replace(/\s+/g, '');
			var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
			var color = val.toLowerCase();
			if (reg.test(color)) {
				// 如果为3位颜色值，则转为6位，例如：#ff0 => #fff000
				if (color.length === 4) {
					var hex = '#';
					for (var i = 1; i < 4; i += 1) {
						hex += color.slice(i, i + 1).concat(color.slice(i, i + 1));
					}
					color = hex;
				}
				// 处理6位颜色值，转为RGB
				var arr = [];
				for (var i = 1; i < 7; i += 2) {
					arr.push(parseInt('0x' + color.slice(i, i + 2)));
				}
				return {
					r: arr[0],
					g: arr[1],
					b: arr[2],
					a: 1,
					hex: val,
					rgb: 'rgb(' + arr.join(',') + ')'
				};
			}
			this.error = 1;
			return false
		}
	};
	//只返回color色值属性和setColor方法
	var obj = new iceColor(callback);
	return {color:obj.color,setColor:function(value){
		return obj.setColor(value);
	}}
};
(function(){var a = document.createElement('style');a.type = 'text/css';a.innerHTML = '.iceColor,.iceColor-simple{cursor:pointer}.iceColor-main{background:#ffffff;position:absolute;width:255px;z-index:999;font-family:"Microsoft YaHei",Arial,sans-serif;box-shadow:0 0 6px rgba(0,0,0,0.2);border-radius:2px}.iceColor-picker-wrapper,.iceColor-slide-wrapper,.iceColor-alpha-wrapper{position:relative}.iceColor-picker-indicator,.iceColor-slide-indicator,.iceColor-alpha-indicator{position:absolute;left:-1px;top:-1px}.iceColor-picker-bg{width:100%;height:100%;position:absolute;background:linear-gradient(to right,#fff,rgba(255,255,255,0))}.iceColor-picker-bg div{width:100%;height:100%;position:absolute;background:linear-gradient(to top,#000,rgba(0,0,0,0))}.iceColor-control{width:180px;position:absolute;right:10px}.iceColor-view{width:30px;height:30px;border-radius:50%;margin:10px;box-shadow:0 0 5px rgba(0,0,0,0.3)}.iceColor-picker{width:255px;height:145px;cursor:crosshair;position:relative}.iceColor-picker-indicator{width:10px;height:10px;border:1px solid #fff;border-radius:50%;box-shadow:0 0 3px rgba(0,0,0,0.43);cursor:crosshair}.iceColor-slide{width:100%;height:12px;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)}.iceColor-slide-wrapper{margin-top:10px;width:100%}.iceColor-alpha{width:100%;height:12px}.iceColor-alpha-wrapper{width:100%;margin-top:10px;background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==)}.iceColor-slide-indicator,.iceColor-alpha-indicator{width:14px;height:14px;border-radius:50%;background-color:#fff;box-shadow:0 0 3px rgba(0,0,0,0.49);cursor:pointer}.iceColor-value{padding:10px}.iceColor-value label{margin:0;display:inline-block;font-size:12px;height:24px;line-height:24px;padding:0 4px;border:1px solid #ccc;margin-right:5px;vertical-align:middle;color:#ccc;cursor:pointer;user-select:none}.iceColor-value label.iceColor-active{border:1px solid #6c6c6c;color:#6c6c6c}.iceColor-value input{display:inline-block;font-size:12px;height:24px;line-height:24px;padding:0 4px;border:1px solid #ccc;width:157px;vertical-align:middle;outline:none;color:#5b5b5b}.iceColor-confirm{width:40px;text-align:center;display:inline-block;font-size:12px;padding:3px 0;vertical-align:middle;color:#fff;cursor:pointer;background:#595959;margin-top:5px;border-radius:2px}.iceColor-confirm:hover{color:#fff;background:#222222}.iceColor-sel{display:inline-block;width:190px;vertical-align:middle;margin-top:5px}.iceColor-sel span{display:inline-block;width:14px;height:14px;border-radius:2px;vertical-align:middle;cursor:pointer;margin-right:5px;transition:all .3s}.iceColor-sel span:hover{border-radius:50%}.iceColor-input{border-left:5px solid}.iceColor-input:focus{border-left:5px solid}.iceColor-magic{width:160px;height:35px;display:inline-flex;border:1px solid #e3e3e3;justify-content:space-between;align-items:center}.iceColor-magic input{width:123px;height:33px;border:none;border-right:1px solid #e3e3e3;font-size:15px;outline:none;margin-right:0}.iceColor-magic input:focus{border:none;border-right:1px solid #e3e3e3}.iceColor-magic label{margin:0;padding:0;width:27px;height:27px;margin-right:4px;border-radius:2px;overflow:hidden;background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==)}.iceColor-magic i{width:100%;height:100%;display:inline-block;cursor:pointer;text-align:center;box-shadow:none;position:relative}.iceColor-magic i::before{content:"";width:10px;height:10px;display:inline-block;border-bottom:1px solid #ffffff;border-right:1px solid #ffffff;transform:rotate(45deg);top:6px;left:9px;position:absolute}';document.getElementsByTagName('head')[0].appendChild(a);})();