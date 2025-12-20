'use strict';
/**
 * ice函数库
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2016-03-02
 * 更新：2023-04-28
 * MIT License By iceui.cn
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 */
;(function() {
	//实例化对象
	window.ice = function (str,obj){
		return new ice.init(str,obj);
	};
	//ice版本号
	ice.version = '2.0.6';
	ice.site = 'https://iceui.cn';
	if(!parent.length){
		var a='background:#',b='color:#8783e1;',c='padding:2px 0;font-size:12px;',d='font-family:"Microsoft YaHei";';
		console.log.apply(console, ['%c %c %c %c　ICEUI '+ice.version+' - ★ 唯美青丝 ★  %c  %c %c   '+ice.site+'  %c ❤ %c❤ %c❤',a+'8783e1;'+c+d+'margin:5px 0;',a+'9d99f6;'+c+d+'margin:5px 0;',a+'aeabf4;'+c+d,b+a+'ecebff;'+c+d,a+'aeabf4;'+c+d,a+'aeabf4;'+c+d,''+b+'text-decoration:none;'+c+d,b+a+'fff;'+c,b+a+'fff; '+c,b+a+'fff;'+c+'']);
	}
	//ice链接地址
	ice.src = document.currentScript ? document.currentScript.src : document.scripts[document.scripts.length - 1].src;
	//ice路径目录
	ice.path = ice.src.replace(window.location.origin,'');
	ice.path = ice.path.substring(0, ice.path.lastIndexOf('/')+1);
	/**
	 * 动态加载JS
	 * @param {string} url 脚本地址
	 * @param {function} callback  回调函数
	 * @return void
	 */
	ice.loadJs = function(options, callback, type) {
		if(!options) return false;
		var url = options,code,el=document;
		if(typeof options == 'object'){
			callback = options.callback;
			type = options.type;
			url = options.src;
			code = options.code;
			el = options.el || el;
		}else{
			url = options;
		}
		var head = el.getElementsByTagName('head')[0];
		var script = el.createElement('script');
		if(type) script.type = type;
		if(code){
			script.innerHTML = code;
			head.appendChild(script);
			callback && callback();
		}else{
			var s = ice('script',el);
			for(var i=0;i<s.length;i++){
				if(s[i].src && s[i].src.indexOf(url) !== -1){
					return callback && callback();
				}
			}
			script.src = url;
			script.onload = function() {
				callback && callback();
			};
			head.appendChild(script);
		}
	};
	/**
	 * 动态加载CSS
	 * @param {string} url 样式地址
	 */
	ice.loadCss = function(url) {
		var head = document.getElementsByTagName('head')[0];
		var link = document.createElement('link');
		link.type = 'text/css';
		link.rel = 'stylesheet';
		link.href = url;
		head.appendChild(link);
	};
	/**
	 * 选择器
	 * @param  {string|function}    str  节点或者function(ready方式)
	 * @param  {object}             obj  需要选择该对象下的节点
	 * @return {object|void}
	 */
	ice.init = function(str, obj) {
		this.length = 0;
		obj = obj?obj:document;
		var nodeType = Object.prototype.toString.call(obj);
			obj = nodeType == '[object HTMLFormElement]' ? [obj] : obj;
		if (typeof str == 'string' && str.indexOf(' ') == -1 && !str.indexOf('.') === 0 && !str.indexOf('[') === 0) { //判断是否为组合类
			var a = str[0],
				b = str.slice(1); //获取属性名称
			
			if(obj.length){
				var arr = [];
				for(var i=0;i<obj.length;i++){
					if (a == '#') {
						if (str.indexOf('[') !== -1){
							return ice.elThat(this,obj.querySelectorAll(str));
						}
						return ice.elThat(this,document.getElementById(b));
					} else if (a == '.') {
						var el = obj[i].getElementsByClassName(b);
						if(el[0]){
							for(var s=0;s<el.length;s++){
								arr.push(el[s]);
							}
						}
					} else if (str.indexOf('[') == -1 && str.indexOf(':') == -1) {
						var el = obj[i].getElementsByTagName(str);
						if(el[0]){
							for(var s=0;s<el.length;s++){
								arr.push(el[s]);
							}
						}
					} else if (a == '[') {
						var el = obj[i].querySelectorAll(str);
						if(el[0]){
							for(var s=0;s<el.length;s++){
								arr.push(el[s]);
							}
						}
					}
				}
				return ice.elThat(this,arr);
			}else{
				if (a == '#') {
					if (str.indexOf('[') !== -1){
						return ice.elThat(this,obj.querySelectorAll(str));
					}
					return ice.elThat(this,document.getElementById(b));
				} else if (a == '.') {
					return ice.elThat(this,obj.getElementsByClassName(b));
				} else if (str.indexOf('[') == -1 && str.indexOf(':') == -1) {
					if(obj.length == 0) return false;
					return ice.elThat(this,obj.getElementsByTagName(str));
				}
			}
		}
		if (typeof str == 'object') return ice.elThat(this,str); //判断是否为对象
		if (typeof str == 'function') {
			ice.ready(str);
			return;
		}
		if(obj.length){
			var arr = [];
			for(var i=0;i<obj.length;i++){
				var el = obj[i].querySelectorAll(str);
				if(el[0]){
					for(var s=0;s<el.length;s++){
						arr.push(el[s]);
					}
				}
			}
			return ice.elThat(this,arr);
		}
		if(obj.length === 0){
			return false;
		}
		return ice.elThat(this,obj.querySelectorAll(str));
	};
	//继承方法
	ice.init.prototype={
		//遍历
		each: function(fn) {
			return ice.each(this, fn)
		},
		//选择某个dom
		s: function(s) {
			return ice(this[s]);
		},
		//选择某个dom
		i: function(s) {
			return ice(this[s]);
		},
		//获取value值
		val: function(v){
			return ice.val(this,v);
		},
		//获取或设置html
		html: function(v) {
			return ice.html(this, v)
		},
		//获取或设置text
		text: function(v) {
			return ice.text(this, v)
		},
		//获取表单
		form: function(v) {
			return ice.form(this,v);
		},
		//子元素的最后追加元素
		append: function(html) {
			return ice.append(this,html)
		},
		//子元素的前面追加元素
		prepend: function(html) {
			return ice.prepend(this,html)
		},
		//被选元素之前插入元素
		before: function(html) {
			return ice.before(this,html)
		},
		//被选元素之后插入元素
		after: function(html) {
			return ice.after(this,html)
		},
		//获取对象距离窗口页面的顶部和左部的距离
		page: function() {
			return ice.page(this)
		},
		//克隆
		clone: function() {
			return ice.clone(this)
		},
		//复选框-全选
		checkall: function() {
			return ice.checkall(this)
		},
		//复选框-反选
		inverse: function() {
			return ice.inverse(this)
		},
		//获取css设置的样式属性
		getCss: function(attr) {
			return ice.getCss(this, attr)
		},
		//删除对象
		del: function() {
			return ice.del(this)
		},
		//获取对象距离屏幕的偏移量
		offset: function() {
			return ice.offset(this)
		},
		//设置或获取对象style的属性值
		css: function(name, v) {
			return ice.css(this, name, v)
		},
		//设置或获取对象style的属性值
		style: function(name, v) {
			return ice.style(this, name, v)
		},
		//设置或获取对象Attribute的属性值
		attr: function(name, v) {
			return ice.attr(this, name, v)
		},
		//删除attr
		delAttr: function(name) {
			return ice.delAttr(this, name)
		},
		//删除对象class
		delCss: function(name) {
			return ice.delCss(this, name)
		},
		//给对象添加点击事件
		click: function(fn) {
			return ice.click(this, fn)
		},
		//给对象添加双击事件
		dblclick: function(fn) {
			return ice.dblclick(this, fn)
		},
		//当元素的值发生改变时触发事件
		change: function(fn) {
			return ice.change(this, fn)
		},
		//给对象添加事件
		on: function(type, fn, bool) {
			return ice.on(this, type, fn, bool)
		},
		//触发对象定义的指定事件
		trigger: function(ev, bubbles=true, cancelable=false, composed=false) {
			return ice.trigger(this, ev, bubbles, cancelable, composed);
		},
		//返回当前元素所在父元素的索引值
		index(){
			return ice.index(this);
		},
		//方法返回被选元素的后代元素
		find: function(name) {
			return ice.find(this, name);
		},
		//返回被选元素的所有直接子元素
		children: function(name) {
			return ice.children(this, name);
		},
		//返回被选元素的所有直接子元素
		childrens: function(name) {
			return ice.childrens(this, name);
		},
		//返回被选元素的所有兄弟元素
		siblings: function(name) {
			return ice.siblings(this, name);
		},
		//返回被选元素的上一个兄弟元素
		prev: function(name) {
			return ice.prev(this, name);
		},
		//返回被选元素的下一个兄弟元素
		next: function(name) {
			return ice.next(this, name);
		},
		//查找当前的祖先元素
		parent: function(name) {
			return ice.parent(this, name);
		},
		//查找所有的祖先元素
		parents: function() {
			return ice.parents(this);
		},
		//给对象添加class
		addCss: function(name) {
			return ice.addCss(this, name)
		},
		//判断对象是否存在class
		hasCss: function(name) {
			return ice.hasCss(this, name)
		},
		//判断对象是否存在style
		hasStyle: function(name) {
			return ice.hasStyle(this, name)
		},
		//如果对象存在指定的css，则删除，不存在则创建
		toggleCss: function(nameA, nameB,fnA,fnB) {
			return ice.toggleCss(this, nameA, nameB,fnA,fnB)
		},
		//显示对象
		show: function() {
			return ice.show(this)
		},
		//隐藏对象
		hide: function() {
			return ice.hide(this)
		},
		//隐藏和显示对象
		toggle: function(fnA,fnB) {
			return ice.toggle(this,fnA,fnB)
		},
		//设置元素透明度
		opacity: function(s) {
			return ice.opacity(this, s)
		},
		//淡入效果
		fadeIn: function(speed, callback) {
			return ice.fadeIn(this, speed, callback)
		},
		//淡出效果
		fadeOut: function(speed, callback) {
			return ice.fadeOut(this, speed, callback)
		},
		//淡入出开关
		fadeToggle: function(speed, callback) {
			return ice.fadeToggle(this, speed, callback)
		},
		//向下滑动显示
		slideDown: function(time, callback) {
			return ice.slideDown(this, time, callback)
		},
		//向上滑动隐藏
		slideUp: function(time, callback) {
			return ice.slideUp(this, time, callback)
		},
		//向上向下滑动隐藏
		slideToggle: function(time, callback) {
			return ice.slideToggle(this, time, callback)
		},
		animate: function(json,options) {
			return ice.animate(this, json, options)
		},
	};
	//判断是否为function对象
	ice.isFunction = function(obj) {
		return typeof obj === 'function' && typeof obj.nodeType !== 'number';
	};
	//判断是否为window对象
	ice.isWindow = function isWindow(obj) {
		return obj != null && obj === obj.window;
	};
	//判断是否为array对象
	ice.isArrayLike = function(obj) {
		var length = !!obj && 'length' in obj && obj.length,type = typeof obj;
		if (ice.isFunction(obj) || ice.isWindow(obj)) return false;
		return type === 'array' || length === 0 || typeof length === 'number' && length > 0 && (length - 1) in obj;
	};
	ice.elThat = function(that,el){
		if(!el || (typeof el == 'object' && el.length === 0) || (typeof el == 'array' && el.length === 0)){
			return that;
		}else{
			if(el.tagName == 'SELECT' || el.tagName == 'FORM'){
				that.length = 1;
				that[0] = el;
			}else if(el.length){
				that.length = el.length;
				let i = 0;
				for (; i < el.length; i++) {
					that[i] = el[i];
				}
			}else{
				that.length = 1;
				that[0] = el;
			}
		}
		return that;
	};
	//遍历
	ice.each = function(el, fn) {
		if(ice.isWindow(el)){
			fn.call(el, 0, el);
			return el;
		}
		if (!el) return false;
		var length, i = 0;
		if (ice.isArrayLike(el)) {
			length = el.length;
			for (; i < length; i++) {
				if (fn.call(el[i], i, el[i], el, length) === false) break;
			}
		} else {
			for (i in el) {
				if (fn.call(el[i], i, el[i], el, length) === false) break;
			}
		}
		return el;
	};
	//遍历全部节点
	ice.eachNode = function(el, fn, s) {
		s = s || 0;
		if (!el.children || el.tagName == 'TEMPLATE') return;
		for (var i = 0; i < el.children.length; i++) {
			s += i + 1;
			fn.call(el.children[i],s);
			if (el.children[i].children) ice.eachNode(el.children[i], fn, s);
		}
	};
	//字符串转dom节点
	ice.toDom = function (html) {
		if (typeof html === 'string') {
			var temp = document.createElement('div');
			temp.innerHTML = html;
			var frag = document.createDocumentFragment();
			while (temp.firstChild) {
				frag.appendChild(temp.firstChild);
			}
			return frag;
		} else {
			return html;
		}
	};
	//克隆对象
	ice.cloneObj = function (obj){
		if(!obj) return obj;
	    if (typeof obj !== 'object') return obj;
	    let newObj = Array.isArray(obj) ? [] : {};
	    for (let key in obj) {
	    	newObj[key] = ice.cloneObj(obj[key]);
	    }
	    return newObj;
	};
	//创建节点
	ice.c = function(name){
		return document.createElement(name);
	};
	//创建文档碎片
	ice.cf = function(){
		return document.createDocumentFragment();
	};
	//数学运算
	ice.p = function(num){
		class iceP {
		    constructor(s) {
		        this.s = s;
		        return this;
		    }
		    //加
		    add(s = 0) {
		        this.s = this.operation(this.s, s, 'add');
		        return this;
		    }
		    //减
		    sub(s = 0) {
		        this.s = this.operation(this.s, s, 'sub');
		        return this;
		    }
		    //乘
		    mul(s = 1) {
		        this.s = this.operation(this.s, s, 'mul');
		        return this;
		    }
		    //除
		    exc(s = 1) {
		        this.s = this.operation(this.s, s, 'exc');
		        return this;
		    }
		    //保留小数位数
		    dec(s) {
		        if(this.s < 0){
		            return -(this._dec(this.s, s));
		        }else{
		            return this._dec(this.s, s);
		        }
		    }
		    //小数位数不足补零
		    tra(s) {
		        return this._tra(this.s, s);
		    }
		    //取整
		    int() {
		        if(this.s < 0){
		            return -(this._int(this.s));
		        }else{
		            return this._int(this.s);
		        }
		    }
		    //小数点保留位数,不足补零
			_tra(s, place) {
			    var a = s;
			    if(place){
			    	a = (a + '').match(new RegExp('(-?\\d+\\.\\d{0,' + place + '})|(-?\\d+$)'));
			    }else{
			    	a = (a + '').match(new RegExp('(-?\\d+\\.\\d+)|(-?\\d+$)'));
			    }
			    a = a !== null ? a[0] : '0';
			    var arr = a.split('.');
			    arr[1] = arr[1] ? arr[1] : '';
			    for (let i = 0, len = place - arr[1].length; i < len; i++) {
			        arr[1] += '0';
			    }
			    a = arr.join('.');
			    return a;
			}
			//保留指定位数的小数
			_dec(s, place) {
			    var a = s;
			    if(place){
			    	a = (a + '').match(new RegExp('(\\d+\\.?\\d{0,' + place + '})'));
			    }else{
			    	a = (a + '').match(new RegExp('(\\d+\\.?\\d+)'));
			    }
			    a = a !== null ? a[0] : '';
			    return a;
			}
			//输入时限制整数
			_int(s) {
			    var a = s;
			    a = (a + '').match(new RegExp('(\\d+)'));
			    a = a !== null ? a[0] : '';
			    return a;
			}

		    //判断是否为整数
		    isInteger(s) {
		        return Math.floor(s) === s
		    }
		    /*
		     * 将一个浮点数转成整数，返回整数和倍数。如 3.14 >> 314，倍数是 100
		     * @param floatNum {number} 小数
		     * @return {object}
		     * {times:100, num: 314}
		     */
		    toInteger(floatNum) {
		        var ret = {
		            times: 1,
		            num: 0
		        };
		        if (this.isInteger(floatNum)) {
		            ret.num = floatNum;
		            return ret
		        }
		        var strfi = floatNum + '';
		        var dotPos = strfi.indexOf('.');
		        var len = strfi.slice(dotPos + 1).length;
		        var times = Math.pow(10, len);
		        var intNum = parseInt(floatNum * times + (floatNum < 0 ? -0.5 : 0.5), 10);
		        ret.times = times;
		        ret.num = intNum;
		        return ret
		    }
		    /**
		     * 核心方法，实现加减乘除运算，确保不丢失精度
		     * 思路：把小数放大为整数（乘），进行算术运算，再缩小为小数（除）
		     * @param a  {number} 运算数1
		     * @param b  {number} 运算数2
		     * @param op {string} 运算类型
		     */
		    operation(a, b, op) {
		        a = Number(a),b=Number(b);
		        var o1 = this.toInteger(a),
		        	o2 = this.toInteger(b),
		        	n1 = o1.num,
		        	n2 = o2.num,
		        	t1 = o1.times,
		        	t2 = o2.times,
		        	max = t1 > t2 ? t1 : t2,
		        	result;

		        switch (op) {
		            // 加
		            case 'add':
		                if (t1 === t2) { // 两个小数位数相同
		                    result = n1 + n2
		                } else if (t1 > t2) { // o1 小数位 大于 o2
		                    result = n1 + n2 * (t1 / t2)
		                } else { // o1 小数位 小于 o2
		                    result = n1 * (t2 / t1) + n2
		                }
		                return result / max;
		            // 减
		            case 'sub':
		                if (t1 === t2) {
		                    result = n1 - n2
		                } else if (t1 > t2) {
		                    result = n1 - n2 * (t1 / t2)
		                } else {
		                    result = n1 * (t2 / t1) - n2
		                }
		                return result / max;
		            // 乘
		            case 'mul':
		                return (n1 * n2) / (t1 * t2);
		            // 除
		            case 'exc':
		                return (n1 / n2) * (t2 / t1);
		        }
		    }
		}
		return new iceP(num);
	};
	//解析json
	ice.jsonDecode = function(str, bool) {
		if(!str || !str.length) return false;
		var obj = eval('(' + str + ')');
		if (bool) {
			var arr = []
			for (var i in obj) {
				arr.push(obj[i]);
			}
			return arr;
		}
		return obj;
	};
	//阻止冒泡
	ice.sp = function(event) {
		window.event ? window.event.cancelBubble = true : event.stopPropagation();
	};
	//阻止默认行为
	ice.pd = function(event) {
		window.event ? window.event.returnValue = false : event.preventDefault();
	};
	//注册滚动条监视事件
	ice.mouseWheel = function(obj, fn) {
		//判断鼠标滚轮滚动方向
		if (obj.addEventListener) obj.addEventListener('DOMMouseScroll', wheel, false);
		obj.onmousewheel = wheel; //W3C
		function stopDefault(e) {
			if (e && e.preventDefault) {
				e.preventDefault();
			} else {
				window.event.returnValue = false;
			}
			return false;
		}
		//统一处理滚轮滚动事件
		function wheel(event) {
			stopDefault(event);
			var delta = 0;
			if (!event) event = obj.event;
			if (event.wheelDelta) { //IE、chrome浏览器使用的是wheelDelta，并且值为“正负120”
				delta = event.wheelDelta / 120;
				if (obj.opera) delta = -delta; //因为IE、chrome等向下滚动是负值，FF是正值，为了处理一致性，在此取反处理
			} else if (event.detail) { //FF浏览器使用的是detail,其值为“正负3”
				delta = -event.detail / 3;
			}
			if (delta) {
				fn(delta);
			}
		}
	};
	//设置sessionStorage赋值完全等于取值，原生的sessionStorage实际只能存储字符串
	//ice.data() 获取整个sessionStorage
	//ice.data('t1') 获取t1值
	//ice.data('t1',123) 设置t1值
	//ice.data({t1:123,t2:456}) 设置t1和t2值
	//ice.data('t1',{t2:123,t3:456}) 设置t1值，获取后也是该对象
	ice.data = function(name,value){
		if(name === undefined){
			return sessionStorage;
		}
		if(value === undefined){
			if(typeof name === 'object'){
				for(var k in name){
					setData(k,name[k])
				}
			}else{
				return getData(name);
			}
		}
		if(value !== undefined){
			setData(name,value);
		}
		function setData(k,v){
			let obj = sessionStorage.getItem('_iceDataType');
			obj = obj ? ice.str2obj(obj) : {};
			obj[k] = typeof v;
			if(obj[k] === 'object'){
				v = ice.obj2str(v);
			}
			sessionStorage.setItem(k,v);
			sessionStorage.setItem('_iceDataType',ice.obj2str(obj));
		}
		function getData(k){
			let v = sessionStorage.getItem(k);
			let obj = sessionStorage.getItem('_iceDataType');
			if(obj){
				obj = ice.str2obj(obj);
				if(obj[k] === 'number'){
					return Number(v);
				}else if(obj[k] === 'object'){
					return ice.str2obj(v);
				}else if(obj[k] === 'function'){
					return ice.str2obj(v);
				}else if(obj[k] === 'boolean'){
					return v.toLowerCase() === 'true' ? true : false;
				}
			}
			return v;
		}
	};
	//清除sessionStorage
	ice.delData = function(name){
		if(name){
			sessionStorage.removeItem(name);
		}else{
			for(var k in sessionStorage){
				sessionStorage.removeItem(k);
			}
		}
	};
	//设置localStorage赋值完全等于取值，原生的localStorage实际只能存储字符串
	ice.localData = function(name,value){
		if(name === undefined){
			return localStorage;
		}
		if(value === undefined){
			if(typeof name === 'object'){
				for(var k in name){
					setData(k,name[k])
				}
			}else{
				return getData(name);
			}
		}
		if(value !== undefined){
			setData(name,value);
		}
		function setData(k,v){
			let obj = localStorage.getItem('_iceDataType');
			obj = obj ? ice.str2obj(obj) : {};
			obj[k] = typeof v;
			if(obj[k] === 'object'){
				v = ice.obj2str(v);
			}
			localStorage.setItem(k,v);
			localStorage.setItem('_iceDataType',ice.obj2str(obj));
		}
		function getData(k){
			let v = localStorage.getItem(k);
			let obj = localStorage.getItem('_iceDataType');
			if(obj){
				obj = ice.str2obj(obj);
				if(obj[k] === 'number'){
					return Number(v);
				}else if(obj[k] === 'object'){
					return ice.str2obj(v);
				}else if(obj[k] === 'function'){
					return ice.str2obj(v);
				}else if(obj[k] === 'boolean'){
					return v.toLowerCase() === 'true' ? true : false;
				}
			}
			return v;
		}
	};
	//清除sessionStorage
	ice.delLocalData = function(name){
		if(name){
			localStorage.removeItem(name);
		}else{
			for(var k in localStorage){
				localStorage.removeItem(k);
			}
		}
	};
	//设置cookie
	ice.setCookie = function(name,value,day=1){
		var t = new Date();
		t.setDate(t.getDate()+day);
		document.cookie = name+'='+value+';expires='+t.toUTCString();
	};
	//获取cookie
	ice.getCookie = function(name){
		var arr = document.cookie.split('; ');
		for(var i=0;i<arr.length;i++){
			var arr2 = arr[i].split('=');
			if(arr2[0]==name){
				return arr2[1];
			}
		}
		return '';
	};
	//移除cookie
	ice.delCookie = function(name){
		document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT';
	};
	//判断当前设备是否为移动端
	ice.isMobile = function() {
		return /Android|webOS|iPhone|iPod|BlackBerry/i.test(navigator.userAgent) ? true : false;
	};
	//格式化字节单位
	ice.toSize = function(bytes) {
		if (bytes === 0) return '0 B';
		var k = 1024,
			sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
			i = Math.floor(Math.log(bytes) / Math.log(k));
		return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
	};
	//获取网址get的值
	ice.getUrl = function(name, url) {
		url = url || 0;
		var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
		var r = url ? url.search.slice(1).match(reg) : window.location.search.slice(1).match(reg);
		if (r != null) return decodeURI(r[2]);
		return null;
	};
	//当文档解析完毕且为操作准备就绪时，函数作为document的方法调用
	ice.ready = (function() {
		var f = [];
		var r = false;
		function handler(e) {
			if (r) return; //确保事件处理程序只完整运行一次
			if (e.type === 'onreadystatechange' && document.readyState !== 'complete') {
				return;
			}
			//运行所有注册函数，注意每次都要计算funcs.length
			//以防这些函数的调用可能会导致注册更多的函数
			for (var i = 0; i < f.length; i++) {
				f[i].call(document);
			}
			//事件处理函数完整执行,切换ready状态, 并移除所有函数
			r = true;
			f = null;
		}
		//为接收到的任何事件注册处理程序
		if (document.addEventListener) {
			document.addEventListener('DOMContentLoaded', handler, false);
			document.addEventListener('readystatechange', handler, false); //IE9+
			window.addEventListener('load', handler, false);
		} else if (document.attachEvent) {
			document.attachEvent('onreadystatechange', handler);
			window.attachEvent('onload', handler);
		}
		//返回ready()函数
		return function ready(fn) {
			if (r) {
				fn.call(document);
			} else {
				f.push(fn);
			}
		}
	})();

	ice.isJson = function(str) {
		if (typeof str == 'string') {
			try {
				JSON.parse(str);
				return true;
			} catch(e) {
				return false;
			}
		}
		return false;
	};
	
	//一看就知道这是AJAX，省的我解释了，不然还得写一大溜参数说明
	ice.ajax = function(json,data,method) {
		if (typeof json == 'string'){
			json = { url: json };
			if (typeof data == 'string'){
				json.form = data;
			} else {
				json.data = data;
			}
		}
	    if(json.ajaxConf !== false && typeof ice.ajaxConf == 'function'){
			json = ice.ajaxConf(json);
		}
		if (!json || !json.url) return;
		json.type = json.type ? json.type : (method ? method : 'post');
		json.timeout = json.timeout || 15000;
		json.async = json.async != undefined ? json.async : true;
		json.json = json.json != undefined ? json.json : true;
		return new Promise((resolve,reject)=>{
			if(!json.data){
				if(json.form){
					json.data = ice(json.form).form();
				}
			}
			var json2url = function(json) {
				var arr = [];
				function arrPush(k,v){arr.push(k + '=' + encodeURIComponent(v))}
				for (var name in json) {
					if(Array.isArray(json[name])){
						if (typeof json[name][0] == 'object'){
							arrPush(name,ice.obj2str(json[name]));
						}else{
							for (var k in json[name]) {
								arrPush(name,json[name][k]);
							}
						}
					}else{
						typeof json[name] == 'object' ? arrPush(name,ice.obj2str(json[name])) : arrPush(name,json[name]);
					}
				}
				return arr.join('&');
			}
			//创建
			var xhr = new XMLHttpRequest();
			//连接 和 发送 - 第二步
			switch (json.type.toLowerCase()) {
				case 'post':
					xhr.open('POST', json.url, json.async);
					//设置表单提交时的内容类型
					xhr.setRequestHeader('X-Requested-With','XMLHttpRequest');
					if(json.header){
						for(var k in json.header){
							xhr.setRequestHeader(k, json.header[k]);
						}
					}else{
						if(json.data instanceof FormData == false){
							xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
						}
					}
					if(json.body){
						xhr.send(json.data instanceof FormData?json.data:ice.obj2str(json.data));
					}else{
						xhr.send(json.data instanceof FormData?json.data:json2url(json.data));
					}
					break;
				default:
					var _data = json2url(json.data);
					var _url = json.url + (_data.length ? (json.url.indexOf('?') > -1 ? '&' : '?') + _data : '');
					xhr.open('GET', _url, json.async);
					xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); 
					if(json.header){
						for(var k in json.header){
							xhr.setRequestHeader(k, json.header[k]);
						}
					}
					xhr.send();
					break;
			}
			//接收 - 第三步
			json.loading && json.loading();
			json.timer = setTimeout(function() {
				xhr.onreadystatechange = null;
				json.error && json.error('网络超时。');
				json.complete && json.complete(408);
			}, json.timeout);
			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) {
					clearTimeout(json.timer);
					if (xhr.status >= 200 && xhr.status < 300 || xhr.status == 304) {
						if(xhr.responseText.length>0){
							if(ice.isJson(xhr.responseText)){
								var res = json.json ? JSON.parse(xhr.responseText) : xhr.responseText;
							}else{
								var res = json.json ? {code:200,data:xhr.responseText} : xhr.responseText;
							}
						}else{
							var res = '';
						}
						if(!json.success || (json.success && json.success(res) !== false)) resolve && resolve(res);
						json.complete && json.complete(res);
					} else {
						reject && reject(xhr.status, xhr.responseText);
						json.error && json.error(xhr.status, xhr.responseText);
						json.complete && json.complete(xhr.status, xhr.responseText);
					}
				}
			}
		})
	};
	//get请求封装
    ice.get = function (json,data) {
        return ice.ajax(json,data,'get');
    };
    //post请求封装
    ice.post = function (json,data) {
        return ice.ajax(json,data,'post');
    };

	//pjax无刷新
	ice.pjax = function(json){
		json = json || {};
		json.js = json.js !== undefined ? json.js : true;
		json.el = json.el ? (ice(json.el).length ? json.el : 'body') : 'body';
		json.url = json.url ? json.url : window.location.href;
		if(!json.url || json.url== '#' || json.url.trim().toLowerCase().slice(0,11)== 'javascript:')return;
		json.pjaxRun = json.pjaxRun ? json.pjaxRun : false;
		//初始化链接
		var linkInit = function(el){
			ice(el).each(function(){
				if(!this.pjax){
					this.pjax = true;
					ice(this).on('click',function(){
						var url = ice(this).attr('href');
						var isPjax = ice(this).attr('data-pjax');
						var isDownload = ice(this).attr('download');
						if(isDownload || isPjax == 'false' || url== '#' || url.trim().toLowerCase().slice(0,11)== 'javascript:'){
							return;
						}
						ice.pd();
						if(ice(this).attr('target') === '_blank'){
							return window.open(url);
						}
						json.url = url;
						ice.pjax(json);
						return false;
					});
				}
			})
		};
		//重新加载
		window.ice.pjax.render = function() {
			ice.pjax(json);
		};
		//打开指定url
		window.ice.pjax.open = function(url){
			json.url = decodeURIComponent(url);
			ice.pjax(json);
		};
		//加载中动画
		var load = ice.c('div');
		load.innerHTML = json.loading ? json.loading : '<div class="loader"></div>';
		ice(json.el).append(load);
		
		if(!json.pjaxRun){
			json.pjaxRun = true;
			linkInit('a');
			window.addEventListener('popstate', function(e){
				json.url = window.location.pathname + window.location.search;
				json.popstate = true;
				ice.pjax(json);
			}, false);
		}

		if(!json.popstate) {
			history.pushState(null, null, json.url);
		}else{
			json.popstate = false;
		}
		//第一次进入页面不请求
		if(!json.first){
			load && ice(load).del();
			json.first = true;
			return;
		}
		//请求数据
		ice.ajax({
			url:json.url,
			type:json.type ? json.type : 'get',
			ajaxConf:false,
			success(res){
				let temp = ice.c('div');
				// 纠正title
				var title = /<title>([\w\W]*)<\/title>/.exec(res.data);
				title && title.length>1 && ice('title').html(title[1]);
				// 纠正body
				var body = /<body.*?>([\w\W]*)<\/body>/.exec(res.data);
				temp.innerHTML = body && body.length > 1 ? body[1] : res.data;
				let content = ice(json.el,temp);
				let jsonEl = ice(json.el);
				jsonEl.html(content.length ? content[0].innerHTML : temp.innerHTML);
                window.scrollTo(0,0);
				if(json.js){
					var jsObj = [], oldScript = ice('script'), script = ice('script',jsonEl);
					temp = null;
					script.each(function(){
						jsObj.push({
							src: this.src ? 1 : 0,
							type: this.type,
							content: this.src ? this.src : this.innerHTML.trim(),
						})
					})
					!function runJs(callback,i=0){
						if(i < jsObj.length){
							var s = jsObj[i++];
							var j = {
								type:s.type,
								callback(){
									runJs(callback,i);
								}
							};
							if(s.src){
								//如果已存在该js，删掉重建，不然不执行里面的代码
								oldScript.each(function(){
									if(this.src == s.content) ice(this).del();
								})
								j.src = s.content;
							}else{
								j.code = s.content;
							}
							//执行script
							ice.loadJs(j);
						}else{
							callback && callback();
						}
					}(()=>{json.success && json.success(json.url, res)},0);
				}else{
					json.success && json.success(json.url, res);
				}
				linkInit(json.el+' a');
			},
			error(res){
				ice.pjax.open(json.empty);
				json.error && json.error(res);
			},
			complete(){
				load && ice(load).del();
				json.complete && json.complete();
			}
		});
	},

    //按键回调
    ice.keydown = function(key,callback){
	    document.addEventListener('keydown', function (e) {
	        var theEvent = window.event || e;
	        var code = theEvent.keyCode || theEvent.which || theEvent.charCode;
	        if(typeof key == 'function'){
	        	key.call(theEvent,code,e);
	        }else{
		        if (code == key) {
		        	if(typeof callback == 'string'){
		        		eval(callback);
		        	}else{
		        		callback && callback.call(theEvent,code,e);
		        	}
		        }else if(key == undefined){
		        	if(typeof callback == 'string'){
		        		eval(callback);
		        	}else{
		        		callback && callback.call(theEvent,code,e);
		        	}
		        }
	        }
	    })
	};

	//获取滚动条的偏移量
	ice.scroll = function(a) {
		var x = document.compatMode == 'CSS1Compat' ? (window.pageXOffset || document.documentElement.scrollLeft) :
			document.body.scrollLeft;
		var y = document.compatMode == 'CSS1Compat' ? (window.pageYOffset || document.documentElement.scrollTop) :
			document.body.scrollTop;
		if (a == 'x') {
			return x;
		} else if (a == 'y') {
			return y;
		} else if (!a) {
			return {
				x: x,
				y: y
			};
		}
		return obj;
	};
	//自动将滚动条至于最顶部
	ice.setScrollT = function() {
		document.body.scrollTop = document.documentElement.scrollTop = 0;
	};
	//自动将滚动条至于最底部
	ice.setScrollB = function() {
		document.body.scrollTop = document.documentElement.scrollTop = document.body.scrollHeight;
	};

	//页面视口的高宽
	ice.web = function() {
		var web = {};
		web.w = window.innerWidth;
		web.h = window.innerHeight; //页面视口高度
		if (typeof web.w != 'number') {
			if (document.compatMode == 'CSS1Compat') {
				web.w = document.documentElement.clientWidth;
				web.h = document.documentElement.clientHeight;
			} else {
				web.w = document.body.clientWidth;
				web.h = document.body.clientHeight;
			}
		}
		return web;
	};
	//复制文本
	ice.copy=function(text){
		var s = ice.scroll();
		let transfer = document.createElement('input');
		document.body.appendChild(transfer);
		transfer.value = text;
		transfer.focus();
		transfer.select();
		if (document.execCommand('copy')) document.execCommand('copy');
		transfer.blur();
		document.body.removeChild(transfer);
		window.scroll(s.x,s.y);
	};
	//获取随机数
	ice.randInt = function(min, max) {
		return min + Math.round((max - min) * Math.random()); //四舍五入
	};
	//随机生成字符串
	ice.randStr = function(num) {
		if(!num) return;
		var str = '';
		while (num--) {
			//随机字符串 Unicode对应码：[0-9 48-57][A-Z 65-90][a-z 97-122]
			str += Math.random()>0.4?String.fromCharCode(ice.randInt(65,90)):String.fromCharCode(ice.randInt(48,57));
		}
		return str;
	};
	//生成一个唯一的id
	ice.cid = function(str) {
		str = str || '_id';
		return str + new Date().getTime()+Math.floor(Math.random()*1000);
	};
	//跳转网页
	ice.jump = function(url) {
		location.href = url;
	};
	//克隆
	ice.clone = function(el) {
		el = ice.dom2arr(el);
		var node = [];
		ice.each(el,function() {
			node.push(this.cloneNode(true));
		});
		return ice(node);
	};
	//子元素的最后追加元素
	ice.append = function(el,html) {
		el = ice.dom2arr(el);
		html = ice.toDom(html);
		return ice.each(el,function() {
			if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
				this.appendChild(html);
			}
		});
	};
	//子元素的前面追加元素
	ice.prepend = function(el,html) {
		el = ice.dom2arr(el);
		html = ice.toDom(html);
		return ice.each(el,function() {
			if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
				this.insertBefore(html,this.firstChild);
			}
		});
	};
	//被选元素之前插入元素
	ice.before = function(el,html) {
		el = ice.dom2arr(el);
		html = ice.toDom(html);
		return ice.each(el,function() {
			if (this.parentNode) {
				this.parentNode.insertBefore(html,this);
			}
		});
	};
	//被选元素之后插入元素
	ice.after = function(el,html) {
		el = ice.dom2arr(el);
		html = ice.toDom(html);
		return ice.each(el,function() {
			if (this.parentNode) {
				this.parentNode.insertBefore(html,this.nextSibling);
			}
		});
	};
	//获取表单
	ice.form = function(el, clear){
		el = ice.dom2arr(el);
		if(clear === false){
			return ice.each(el, function() {
				ice('input',this).each(function(){
					ice(this).val('');
				});
				ice('textarea',this).each(function(){
					ice(this).val('');
				});
				ice('select',this).each(function(){
					ice(this).val('');
				});
			});
		}
		var arr = {};
		function init(e){
			if(e.name){
				//针对复选
				if(arr[e.name]){
					if(typeof arr[e.name] != 'object'){
						arr[e.name] = [arr[e.name]];
					}
					arr[e.name].push(ice(e).val());
				}else{
					arr[e.name] = ice(e).val();
				}
			}
		}
		ice.each(el,function() {
			ice('input',this).each(function(){
				if(this.type == 'checkbox'){
					if(this.checked)init(this);
				}else if(this.type == 'radio'){
					if(this.checked)init(this);
				}else{
					init(this);
				}
			});
			ice('textarea',this).each(function(){
				init(this);
			});
			ice('select',this).each(function(){
				if(this.name) init(this);
			});
		})
		return arr;
	};
	//显示对象
	ice.show = function(el) {
		el = ice.dom2arr(el);
		return ice.each(el, function() {
			this.style.display = '';
			let d = ice.getCss(this,'display');
			let o = ice.getCss(this,'opacity');
			this.style.opacity = Number(o) == 0 ? 1 : this.style.opacity;
			this.style.display = d == 'none'?'initial':d;
			if(ice.getCss(this,'visibility') == 'hidden') this.style.visibility = 'visible';
		});
	};
	//隐藏对象
	ice.hide = function(el) {
		el = ice.dom2arr(el);
		return ice.each(el, function() {
			this.style.display = 'none';
		});
	};
	//显示隐藏的元素 或 隐藏显示的元素
	ice.toggle = function(el,fnA,fnB) {
		el = ice.dom2arr(el);
		fnA = fnA || function(){};
		fnB = fnB || function(){};
		return ice.each(el, function(i,o) {
			if(ice.getCss(this,'display') == 'none' || ice.getCss(this,'visibility') == 'hidden'){
				ice.show(this);
				fnA.call(o, i, o);
			}else{
				ice.hide(this);
				fnB.call(o, i, o);
			}
		});
	};
	/**
	 * 设置元素透明度
	 * Date 2017-11-08
	 * el {object} 对象
	 * s  {Number} 透明值(0-100)
	 */
	ice.opacity = function(el, s) {
		el = ice.arr2dom(el);
		el.filters ? el.style.filter = 'alpha(opacity=' + s + ')' : el.style.opacity = s / 100;
	};
	/**
	 * 淡入效果
	 * Date 2017-11-08
	 * el       {object} 对象
	 * speed    {number} 淡入速度,(1秒=1000)
	 * opacity  {number} 淡入到指定透明值(0-100)
	 */
	ice.fadeIn = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = callback || function(){};
		speed = speed===true?10:(speed?speed:10);
		return ice.each(el,function(a,b){
			var display = ice.attr(b,'data-fade');
			if(display){
				b.style.display = display;
			}else{
				ice.setDisplay(b);
			}
			var s = 0;
			ice.opacity(b, s);
			+function t(){
				ice.opacity(b, s);
				s += 5;
				if (s <= 100) {
					setTimeout(t, speed);
				}else{
					callback.call(b, a, b);
				}
			}();
		});
	};
	/**
	 * 淡出效果
	 * Date 2017-11-08
	 * el       {object} 对象
	 * speed    {number} 淡出速度,(1秒=1000)
	 * callback {function} 回调函数
	 */
	ice.fadeOut = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = typeof speed == 'function' ? speed : callback;
		return ice.each(el,function(a,b){
			if(ice.getCss(this,'display') == 'none')return;
			ice.setDisplay(b);
			var s = this.style.opacity ? this.style.opacity * 100 : (this.filters ? this.filters.alpha.opacity : 100);
			var display = ice.getDisplay(b);
			(function t(){
				ice.opacity(b, s);
				s -= 5;
				if (s >= 0) {
					setTimeout(t, speed);
				} else if (s < 0) {
					b.style.display = 'none';
					ice.attr(b,'data-fade',display);
					callback && callback.call(b, a, b);
				}
			})();
		});
	};
	/**
	 * 淡入出效果
	 * Date 2017-11-08
	 * el       {object} 对象
	 * speed    {number} 淡出速度,(1秒=1000)
	 * callback {function} 回调函数
	 */
	ice.fadeToggle = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = callback || function(){};
		speed = speed===true?10:(speed?speed:10);
		return ice.each(el,function(){
			if(ice.getCss(this,'display') == 'none'){
				ice.fadeIn(this, speed, callback);
			}else{
				ice.fadeOut(this, speed, callback);
			}
		});
	};
	//获取默认display
	ice.getDisplay = function(el){
		el = ice.arr2dom(el);
		if(el.style.display == 'none'){
			el.style.display = null;
		}
		return ice.getCss(el,'display');
	};
	//设置默认display
	ice.setDisplay = function(el){
		el = ice.arr2dom(el);
		let display = ice.getCss(el,'display');
		if(display == 'inline'){
			el.style.display = 'inline-block';
		}else if(display != 'none'){
			el.style.display = display;
		}else{
			el.style.display = null;
			let display = ice.getCss(el,'display');
			if(display == 'inline'){
				el.style.display = 'inline-block';
			}else if(display == 'none'){
				el.style.display = 'block';
			}else{
				el.style.display = display;
			}
		}
	};
	//判断style是否存在某条属性
	ice.hasStyle = function(el,name){
		if(typeof el != 'string'){
			el = ice.arr2dom(el);
			var attr = ice.attr(el,'style');
		}else{
			var attr = el;
		}
		if(!attr) return false;
		//去掉所有空格
		attr = attr.replace(/\s/g,'');
		attr = attr.split(';');
		var i = attr.length;
		while(i--){
			if(attr[i].split(':')[0] == name) return true;
		}
		return false;
	};
	/**
	 * 向下滑动显示
	 * Date 2017-08-08
	 * el       {object} 对象
	 * speed    {number} 速度,(1秒=1000)
	 * callback {function} 回调函数
	 */
	ice.slideDown = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = callback || function(){};
		speed = speed===true?5:(speed?speed:5);
		return ice.each(el,function(i,obj){
			var display = ice(this).getCss('display');
			if (display != 'none') return;
			//设置元素样式的本来dispaly
			ice.setDisplay(this);
			var h=this.offsetHeight,a=0,s=1;
			this.style.overflow = 'hidden';
			this.style.height = '0px';
			(function down() {
				s += 0.6;
				a += 1+s;
				if (a < h) {
					obj.style.height = a + 'px';
					setTimeout(down, speed);
				} else {
					obj.style.overflow = null;
					obj.style.height = null;
					//还原之前的style样式
					ice.attr(obj,'style',ice.attr(obj,'ice-slide'));
					//删除备份的style样式
					ice.delAttr(obj,'ice-slide');
					//以防还原过来的style中的display为none
					ice.setDisplay(obj);
					callback.call(obj,i,obj);
				}
			})();
		});
	};
	/**
	 * 向上滑动隐藏
	 * Date 2017-08-08
	 * el    {object} 对象
	 * speed {number} 速度,(1秒=1000)
	 * func  {function} 回调函数
	 */
	ice.slideUp = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = callback || function(){};
		speed = speed===true?10:(speed?speed:10);
		return ice.each(el,function(i,obj){
			//备份style样式
			ice.attr(this,'ice-slide',ice.attr(this,'style'));
			if (this.style.display == 'none') return;
			//设置元素样式的本来dispaly
			ice.setDisplay(this);
			var h=this.offsetHeight,a=h,s=1;
			this.style.overflow = 'hidden';
			(function up() {
				s += 0.6;
				a -= 1+s;
				if (a > 10) {
					obj.style.height = a + 'px';
					setTimeout(up, speed);
				} else {
					obj.style.height = null;
					obj.style.display = 'none';
					obj.style.overflow = null;
					callback.call(obj,i,obj);
				}
			})();
		});
	};
	/**
	 * 上下滑动隐藏
	 * Date 2017-08-08
	 * el    {object} 对象
	 * speed  {number} 速度,(1秒=1000)
	 * func  {function} 回调函数
	 */
	ice.slideToggle = function(el, speed, callback) {
		el = ice.dom2arr(el);
		callback = callback || function(){};
		speed = speed===true?10:(speed?speed:10);
		return ice.each(el,function(){
			if(ice.getCss(this,'display') == 'none'){
				ice.slideDown(this,speed, callback);
			}else{
				ice.slideUp (this,speed, callback)
			}
		});
	};
	/**
	 * 动画帧
	 * callback  {function} 回调函数
	 */
	ice.animationFrame = function (callback) {
		var a=window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame;
		(function b(){
			if(callback() !== false) a(b);
		})();
	};
	/**
	 * 动画
	 * obj: 运动对象
	 * json(json形式): 需要修改的属性
	 * options(json形式):
	 *   ├ duration: 运动时间
	 *   ├ easing: 运动方式（匀速、加速、减速）
	 *   └ callback: 运动完成后执行的函数
	 */
	ice.animate = function(el, json, options) {
		el = ice.dom2arr(el);
		return ice.each(el,function(){
			move(this, json, options);
		});
		function move(elem, jsonS, optionS) {
			optionS = optionS || {};
			var duration = optionS.duration || 500; //运动时间,默认值为500ms;
			var easing = optionS.easing || 'linear'; //运动方式,默认为linear匀速
			var start = {};
			var dis = {};
			var unit = {};
			for (var name in jsonS) {
				var n = parseInt(jsonS[name]);
				start[name] = parseFloat(ice.getCss(elem, name)); //起始位置
				dis[name] = n - start[name]; //总距离
				unit[name] = jsonS[name].slice(String(n).length);
			}
			var count = Math.floor(duration / 100 * 6); //动画1秒60帧，根据时间得出总次数
			var n = 0; //次数
			ice.animationFrame(function(){
				if (n > count) {
					optionS.callback && optionS.callback();
					return false;
				} else {
					for (var name in jsonS) {
						switch (easing) {
							//匀速
						case 'linear':
							var a = n / count;
							var cur = start[name] + dis[name] * a; //当前位置
							break;
							//加速
						case 'ease-in':
							var a = n / count;
							var cur = start[name] + dis[name] * a * a * a;
							break;
							//减速
						case 'ease-out':
							var a = 1 - n / count;
							var cur = start[name] + dis[name] * (1 - a * a * a);
							break;
						}
						if (name == 'opacity') {
							elem.style.opacity = cur;
							elem.style.filter = 'alpha(opacity=' + cur * 100 + ')'; //兼容IE8及以下
						} else {
							elem.style[name] = cur + unit[name];
						}
					}
				}
				n++;
			});
		};
	};
	//获取或设置html
	ice.html = function(el, v) {
		el = ice.dom2arr(el);
		if (typeof v == 'string' || typeof v == 'number') {
			return ice.each(el,function(){
				this.innerHTML = v;
			});
		}else if(typeof v == 'object' && v.tagName) {
			return ice.each(el,function(){
				this.appendChild(v);
			});
		} else {
			return el[0]?el[0].innerHTML:el.innerHTML;
		}
	};
	//获取或设置text
	ice.text = function(el, v) {
		el = ice.dom2arr(el);
		if (v && v.length) {
			return ice.each(el,function(){
				this.innerText = v;
			});
		} else {
			return el[0]?el[0].innerText:el.innerText;
		}
	};
	//对象转为字符串，包括function
	ice.obj2str = function(obj){
		var a= JSON.stringify(obj, function(key, val) {
	    	if (typeof val === 'function') {
	    		var str = '`' + val + '`';
	    		str = str.split('\n').join('FN\\n').split('\t').join('FN\\t');
	    		return str;
	    	}
	    	return val;
	    });
	    a = a.replace(/("`)|(`")/g,'').replace(/FN\\\\n/g,'\n').replace(/FN\\\\t/g,'\t');
	    return a;
	};
	//字符串转为对象
	ice.str2obj = function(str){
	    return eval('('+str+')');
	};
	//获取对象距离屏幕的偏移量
	ice.offset = function(el) {
		el = ice.arr2dom(el);
		var e = el,x = e.offsetLeft,y = e.offsetTop;
		while (e = e.offsetParent) {
			x += e.offsetLeft;
			y += e.offsetTop;
		}
		return {'left': x,'top': y};
	};
	//获取对象距离窗口页面的顶部和左部的距离以及元素的宽高
	ice.page = function(el) {
		el = ice.arr2dom(el);
		if(!el) return false;
		var box = el.getBoundingClientRect(),
			doc = el.ownerDocument,
			body = doc.body,
			html = doc.documentElement,
			clientTop = html.clientTop || body.clientTop || 0,
			clientLeft = html.clientLeft || body.clientLeft || 0,
			y = box.top + (html.scrollTop || body.scrollTop) - clientTop,
			x = box.left + (html.scrollLeft || body.scrollLeft) - clientLeft;
		return {x: x,y: y,width:el.offsetWidth,height:el.offsetHeight};
	};
	//复选框-全选
	ice.checkall = function(el) {
		el = ice.dom2arr(el);
		return ice.each(el, function() {
			this.checked = true
		});
	};
	//复选框-反选
	ice.inverse = function(el) {
		el = ice.dom2arr(el);
		return ice.each(el, function() {
			this.checked = this.checked?false:true;
		});
	};
	//获取css设置的样式属性
	ice.getCss = function(el, attr) {
		el = ice.arr2dom(el);
		return (el.currentStyle || getComputedStyle(el, false))[attr];
	};
	//删除对象
	ice.del = function(el) {
		el = ice.dom2arr(el);
		ice.each(el, function() {
			if(this.parentNode)this.parentNode.removeChild(this)
		});
	};
	//获取选择列表选中的值
	ice.val = function(el,v) {
		if(v != undefined){
			el = ice.dom2arr(el);
			ice.each(el, function() {
				this.selectedIndex = -1;
				if(this.value != undefined) {
					if(this.tagName === 'SELECT'){
						if(Array.isArray(v) && this.multiple){
							v.forEach((value,key)=>{v[key]=v[key]+''});
							for(var i=0;i<this.length;i++){
								this[i].selected = v.includes(this[i].value);
								if(this[i].selected){
									this[i].setAttribute('selected','selected');
								}else{
									this[i].removeAttribute('selected');
								}
							}
						}else if(!Array.isArray(v)){
							v = v+'';
							for(var i=0;i<this.length;i++){
								if(this[i].value == v){
									this.selectedIndex = i;
									this.value = v;
									this[i].selected = true;
									this[i].setAttribute('selected','selected');
								}else{
									this[i].selected = false;
									this[i].removeAttribute('selected');
								}
							}
						}
						
					}else{
						this.value = v;
					}
				}
			});
		}else{
			el = ice.arr2dom(el);
			if(el.tagName === 'SELECT' && el.multiple){
				var arr = [];
				for(var i=0;i<el.length;i++){
					if(el.options[i].selected){
						arr.push(el[i].value);
					}
				}
				return arr;
			}
			return el.value != undefined ? el.value : '';
		}
		return el;
	};
	//设置或获取对象style的属性值
	ice.style = ice.css = function(el, name, value) {
		el = ice.dom2arr(el);
		if (arguments.length == 3 && value) {
			//设置一个样式
			return ice.each(el, function() {
				this.style[name] = value;
			});
		} else {
			if (typeof name == 'string') {
				//获取样式
				var that = el;
				return ice.each(el, function() {
					return that.getCss(this, name);
				});
			} else {
				//批量设置样式
				var json = name;
				return ice.each(el, function() {
					for (var name in json) {
						this.style[name] = json[name];
					}
				});
			}
		}
	};
	//设置或获取对象Attribute的属性值
	ice.attr = function(el, name, value) {
		el = ice.dom2arr(el);
		if (value != undefined) {
			//设置一个属性
			return ice.each(el, function() {
				this.setAttribute(name, value);
			});
		} else {
			if (typeof name == 'string') {
				//获取属性
				el = el[0]?el[0]:el;
				var a = el.getAttribute ? el.getAttribute(name) : false;
				return a==null?false:a;
			} else {
				//批量设置属性
				var json = name;
				return ice.each(el, function() {
					for (var name in json) {
						this.setAttribute(name, json[name]);
					}
				});
			}
		}
	};
	//删除attr
	ice.delAttr = function(el, name) {
		el = ice.dom2arr(el);
		return ice.each(el, function() {
			if (this.getAttribute(name)) this.removeAttribute(name);
		});
	};
	//删除对象class
	ice.delCss = function(el, name) {
		el = ice.dom2arr(el);
		function delcss(that,name){
			var re = new RegExp('\\b' + name + '\\b', 'g');
			if (that.className) {
				that.className = that.className.replace(re, '');
				that.className = that.className.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
				if (that.className == '') {
					that.removeAttribute('class');
				}
			}
		}
		if(name.indexOf(' ') == -1){
			return ice.each(el, function() {
				delcss(this,name);
			});
		}else{
			name = name.split(' ');
			return ice.each(el, function() {
				for(var i=0;i<name.length;i++){
					delcss(this,name[i]);
				}
			});
		}
	};
	//给对象添加点击事件
	ice.click = function(el, fn) {
		el = ice.dom2arr(el);
		return ice.each(el, function(i, o) {
			if(fn){
				o.onclick = function(e) {
					fn.call(o, i, o, e);
				}
			}else{
				o.click();
			}
		});
	};
	//给对象添加双击事件
	ice.dblclick = function(el, fn) {
		el = ice.dom2arr(el);
		return ice.each(el, function(i, o) {
			o.ondblclick = function(e) {
				fn.call(o, i, o, e);
			}
		});
	};
	//数据发生变化触发
	ice.change = function(el, fn) {
		el = ice.dom2arr(el);
		return ice.each(el, function(i, o) {
			o.onchange = function(e) {
				fn.call(o, i, o, e);
			}
		});
	};
	//数据输入时触发
	ice.input = function(el, fn) {
		el = ice.dom2arr(el);
		return ice.each(el, function(i, o) {
			o.oninput = function(e) {
				fn.call(o, i, o, e);
			}
		});
	};
	//给对象添加事件
	ice.on = function(el, type, fn, bool) {
		if(!ice.isWindow(el))el = ice.dom2arr(el);
		bool = false || bool;
		return ice.each(el, function(i, o) {
			o.addEventListener(type, function(e) {
				fn.call(o, i, o, e);
			}, bool)
		});
	};
	//触发自定义的指定事件
	ice.trigger = function(el, ev, bubbles, cancelable, composed){
		if(!ice.isWindow(el))el = ice.dom2arr(el);
		var event = new Event(ev, {bubbles:bubbles, cancelable:cancelable, composed:composed});
		return ice.each(el, function(i, o) {
			o.dispatchEvent(event);
		});
	};
	//对象转为数组对象
	ice.dom2arr = function(el){
		if(!el || (typeof el == 'object' && el.length === 0) || (typeof el == 'array' && el.length === 0)){
			return [];
		}else{
			if(!el[0])el = [el];
		}
		return el;
	};
	//多个数组对象，转为第一个对象
	ice.arr2dom = function(el){
		if(!el || (typeof el == 'object' && el.length === 0) || (typeof el == 'array' && el.length === 0)){
			return false;
		}else{
			if(el[0])el = el[0];
		}
		return el;
	};
	//获取元素在父元素中的index
	ice.index = function(el) {
		el = el[0] || el;
		var index = 0;
		if (!el || !el.parentNode) return -1;
		while (el = el.previousElementSibling) {
			index++;
		}
		return index;
	};
	//返回被选元素的后代元素
	ice.find = function(el, name) {
		el = ice.dom2arr(el);
		return ice(name, el);
	},
	//返回被选元素的所有直接子元素
	ice.children = function(el, name) {
		el = ice.dom2arr(el);
		if(name) return ice(name, el);
		var arr = [];
		ice.each(el, function() {
			ice.each(this.children, function() {
				arr.push(this);
			});
		});
		return ice(arr);
	},
	//返回被选元素的所有子元素
	ice.childrens = function(el) {
		el = ice.dom2arr(el);
		var arr = [];
		function get(obj){
			if(obj.children.length){
				ice.each(obj.children, function() {
					arr.push(this);
					get(this);
				});
			}
		}
		ice.each(el, function() {
			get(this);
		});
		return ice(arr);
	},
	//获得匹配集合中每个元素的兄弟节点
	ice.siblings = function(el, name) {
		el = ice.dom2arr(el);
		var arr = [];
		ice.each(el, function() {
			if(this.parentNode){
				//如果name已定义，则遍历父级下的所有兄弟节点
				ice.each(name ? ice(name, this.parentNode) : this.parentNode.children, function() {
					arr.push(this);
				});
			}
		});
		return ice(arr);
	},
	//获取上一个兄弟节点
	ice.prev = function(el, name) {
		el = ice.dom2arr(el);
		var arr = [];
		ice.each(el, function(i, o) {
			var prev = this.previousElementSibling;
			!name && prev && arr.push(prev);
			name && ice.each(ice(name, this.parentNode), function() {
				if(this === prev){
					arr.push(this);
				}
			});
		});
		return ice(arr);
	},
	//获取下一个兄弟节点
	ice.next = function(el, name) {
		el = ice.dom2arr(el);
		var arr = [];
		ice.each(el, function() {
			var prev = this.nextElementSibling;
			!name && prev && arr.push(prev);
			name && ice.each(ice(name, this.parentNode), function() {
				if(this === prev){
					arr.push(this);
				}
			});
		});
		return ice(arr);
	},
	//查找当前的直接祖先元素或指定祖先元素
	ice.parent = function(el, name) {
		el = ice.dom2arr(el);
		var arr = [];
		if(name){
			var obj = ice(name);
			if(obj.length){
				ice.each(el, function() {
					!function run(z) {
						var p = z.parentNode;
						if (p) {
							if (p.tagName == 'BODY') return;
							for(var i=0;i<obj.length;i++){
								if(p == obj[i]){
									arr.push(p);
									break;
								}
							}
							return run(p);
						}
					}(this);
				});
			}
		}else{
			ice.each(el, function() {
				if(this.parentNode) arr.push(this.parentNode);
			});
		}
		return ice(arr);
	};
	//查找所有的祖先元素
	ice.parents = function(el) {
		var arr = [];
		el = ice.dom2arr(el);
		ice.each(el, function() {
			var p = this.parentNode;
			while (p !== document) {
				var o = p;
				arr.push(o);
				p = o.parentNode;
			}
		});
		return ice(arr);
	};
	//给对象添加class
	ice.addCss = function(el, name) {
		el = ice.dom2arr(el);
		function addcss(that,name){
			var re = new RegExp('\\b' + name + '\\b', 'g');
				if (that.className) {
				if (that.className.search(re) == -1) {
					that.className += ' ' + name;
				}
			} else {
				that.className = name;
			}
			that.className = that.className.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
		}
		if(name.indexOf(' ') == -1){
			return ice.each(el, function() {
				addcss(this,name);
			});
		}else{
			name = name.split(' ');
			return ice.each(el, function() {
				for(var i=0;i<name.length;i++){
					addcss(this,name[i]);
				}
			});
		}
	};
	//判断对象是否存在class
	ice.hasCss = function(el, name) {
		el = ice.arr2dom(el);
		var css = el.className;
		if (!css) return false;
		if(name.indexOf(' ') > -1){
			var nameArr = name.split(' ');
			for(var i=0;i<nameArr.length;i++){
				if (nameArr[i] && !css.includes(nameArr[i])) return false;
			}
		}else{
			if (!css.includes(name)) return false;
		}
		return true;
	};
	//如果对象存在指定的css，则删除，不存在则创建
	ice.toggleCss = function(el, nameA, nameB,fnA,fnB) {
		fnA = fnA || function(){};
		fnB = fnB || function(){};
		el = ice.dom2arr(el);
		return ice.each(el, function(i,o) {
			if(nameB){
				if(ice.hasCss(this, nameA)){
					ice.delCss(this, nameA);
					ice.addCss(this, nameB);
					fnB.call(o, i, o);
				}else{
					ice.addCss(this, nameA);
					ice.delCss(this, nameB);
					fnA.call(o, i, o);
				}
			}else{
				ice.hasCss(this, nameA) ? ice.delCss(this, nameA) : ice.addCss(this, nameA);
			}
		});
	};
	//位数不足补零
	ice.prefixZero = function(num, n) {
		return (Array(n).join(0) + num).slice(-n);
	};
	/**
	 * 将time转化为指定格式的String
	 * Date 2019-01-05
	 * param {string|int|empty} 时间戳|字符串类型时间戳|y-m-d格式|y-m-d格式的时间|为空将返回现在时间
	 * 例子：
	 * time(1480385898)             返回时间戳时间：2016-11-29 10:18:18
	 * time(1480385898,'y年m月d日') 返回时间戳时间：2016年11月29日
	 * time()                       返回当前时间  ：2016-11-29 10:18:18(默认为y-m-d h:i:s格式)
	 * time('y-m-d')                返回当前时间  ：2016-11-29
	 * time('2016-11-29 10:18:18','y/m/d')   返回重新格式化后的时间  ：2016/11/29
	 * 说明：本函数的时间戳可以为10位或者13位，对于兼容10位因为对于时间的格式化，毫秒没有任何意义，只需要精确到秒即可
	 */
	ice.time = function(param, format) {
		param = param || false;
		format = format || 'y-m-d h:i:s';
		if (param && new RegExp('(y|m|d|h|i|s)', 'i').test(param)) {
			var date = new Date();
			format = param;
		} else if (!param) {
			var date = new Date();
		} else {
			if(typeof param == 'string') param = param.replace(/-/g, '/');
			if (parseInt(param) > 100000) { //如果为时间戳
				//php的时间戳是10位
				param = String(param).length === 10 ? parseInt(param + '000') : parseInt(param);
			}
			var date = new Date(param);
		}
		var o = {
			'm': '0' + (date.getMonth() + 1), //月
			'd': '0' + date.getDate(), //日
			'h': '0' + date.getHours(), //时
			'i': '0' + date.getMinutes(), //分
			's': '0' + date.getSeconds() //秒
		};
		format = format.replace(new RegExp('y', 'gi'), date.getFullYear()); //年
		for (var k in o) {
			o[k] = o[k].substring(o[k].length - 2, o[k].length);
			format = format.replace(new RegExp(k, 'gi'), o[k]);
		}
		return format;
	}
	/**
	 * 滚动条平滑滚动到该对象位置
	 * Date 2017-08-08
	 * el      {string} 对象
	 * duration {number} 滚动速度
	 */
	ice.scrollAni = function(el, offset=0, duration=200) {
		var s = ice.scroll().y;
		//结果大于0,说明目标在下方,小于0,说明目标在上方
		var distance = ice.page(el).y - offset - s;
		var scrollCount = duration / 10; //10毫秒滚动一次,计算滚动次数
		var everyDistance = distance / scrollCount //滚动距离除以滚动次数计算每次滚动距离
		for (var index = 1; index <= scrollCount; index++) {
			setTimeout(function() {
				window.scrollBy(0, everyDistance)
			}, 10 * index);
		}
	};
	/**
	 * 锚点平滑滚动
	 * Date 2017-08-08
	 * el      {string} 存放锚点的容器#id或.class
	 * duration {number} 滚动速度
	 */
	ice.scrollAnchor = function(el, offset=0, duration=200) {
		if (!el.length) return console.log('ice：scrollAnchor -->锚点的对象不能为空，请检查！');
		el.each(function(i,e){
			e.onclick = function(e) {
				ice.sp();
				ice.pd();
				let id = ice(this).attr('href');
				ice.scrollAni(ice(id), offset, duration);
				return false;
			}
		});
	};
}());