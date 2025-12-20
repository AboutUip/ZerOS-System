'use strict';
/**
 ************************************************************************
 * ice.view(模板引擎)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-06-28
 * 更新：2022-06-08
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */
var ice = ice || {};
ice.view = function(config, options, msgList) {
	var regs = /\{\{([\w\W]*?)\}\}/g;
	var reg = /\{\{([\w\W]*?)\}\}/;
	var _this;
	/**
	 * ajax请求
	 * @param json：如果为string字符串时，则为url，如果为json对象时，参数说明如下：
	 * 	url：      请求地址
	 * 	type：     请求类型，默认为post，可选值：post，get
	 * 	timeout：  网络超时，默认为15000毫秒
	 * 	async：    异步，默认为true
	 * 	data：     要求为Object或String类型的参数，发送到服务器的数据
	 * 	json：     是否将请求过来的数据自动转为json对象，默认为true
	 * 	success：  请求成功之后的回调函数
	 * 	error：    请求失败之后的回调函数
	 * 	complete： 不管请求成功还是失败，都会调用
	 * @param data：json传参为string字符串时此参数有效，等同于json.data
	 * @return {object}
	*/
	function ajax(json,data) {
		if (typeof json == 'string') {
			json = { url: json };
			if (data) {
				json.data = data;
			}
		}
		if (!json || !json.url) return;
		json.type = json.type || 'post';
		json.timeout = json.timeout || 15000;
		json.async = json.async != undefined ? json.async : true;
		json.json = json.json != undefined ? json.json : true;
		return new Promise((resolve,reject)=>{
			var json2url = function(json) {
				var arr = [];
				for (var name in json) {
					if(Array.isArray(json[name])){
						if (typeof json[name][0] == 'object'){
							arr.push(name + '=' + encodeURIComponent(obj2str(json[name])));
						}else{
							for (var k in json[name]) {
								arr.push(name + '=' + encodeURIComponent(json[name][k]));
							}
						}
					}else{
						arr.push(name + '=' + encodeURIComponent(json[name]));
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
					if(json.data instanceof FormData == false){
						xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
					}
					if(json.header){
						for(var k in json.header){
							xhr.setRequestHeader(k, json.header[k]);
						}
					}
					xhr.send(json.data instanceof FormData?json.data:json2url(json.data));
					break;
				default:
					xhr.open('GET', json.url + '?' + json2url(json.data), json.async);
					xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); 
					xhr.send();
					break;
			}
			//接收 - 第三步
			json.loading && json.loading();
			json.timer = setTimeout(function() {
				xhr.onreadystatechange = null;
				json.error && json.error('网络超时');
				json.complete && json.complete(408);
			}, json.timeout);
			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) {
					clearTimeout(json.timer);
					if (xhr.status >= 200 && xhr.status < 300 || xhr.status == 304) {
						if(xhr.responseText.length>0){
							if(isJson(xhr.responseText)){
								var res = json.json ? JSON.parse(xhr.responseText) : xhr.responseText;
							}else{
								var res = json.json ? {code:200,data:xhr.responseText} : xhr.responseText;
							}
						}else{
							var res = '';
						}
						resolve && resolve(res);
						json.success && json.success(res);
						json.complete && json.complete(res);
					} else {
						reject && reject(xhr.status, xhr.responseText);
						json.error && json.error(xhr.status, xhr.responseText);
						json.complete && json.complete(xhr.status, xhr.responseText);
					}
				}
			}
		})
	}

	//是否为json字符串
	function isJson(str) {
		if (typeof str == 'string') {
			try {
				JSON.parse(str);
				return true;
			} catch(e) {
				return false;
			}
		}
		return false;
	}

	//对象转为字符串，包括function
	function obj2str(obj){
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
	}

	//处理中文输入法输入时
	function inputOn(obj,fn){
		var doing=false;
		obj.addEventListener('compositionstart',function(e){
			doing=true;
		},false);
		obj.addEventListener('input',function(e){
			if(!doing){
				fn(e);
			}
		},false);
		obj.addEventListener('compositionend',function(e){
			doing=false;
			fn(e);
		},false);
	}

	//克隆对象
	function cloneObj(obj){
	    if (typeof obj !== 'object') return obj;
	    let newObj = Array.isArray(obj) ? [] : {};
	    for (let key in obj) {
	    	newObj[key] = cloneObj(obj[key]);
	    }
	    return newObj;
	}
	//去重
	function ra(arr) {
		if(!arr) return [];
		const a = [],b = {};
		for (const i of arr) {
			if (!b[i]) {
				a.push(i);
				b[i] = 1;
			}
		}
		return a
	}
	function isObject (obj) {
		return obj !== null && typeof obj === 'object'
	}
	function isObjectEqual (a, b) {
		var objectA = isObject(a),objectB = isObject(b);
		if (objectA && objectB) {
		  try {
			return JSON.stringify(a) === JSON.stringify(b)
		  } catch (e) {
			return a === b
		  }
		} else if (!objectA && !objectB) {
		  return String(a) === String(b)
		} else {
		  return false
		}
	}
	//获取select值
	function getSelectVal(obj){
		if(obj.multiple){
			var arr = [];
			for(var i=0;i<obj.length;i++){
				if(obj[i].selected){
					arr.push(obj[i].value);
				}
			}
			return arr;
		}else{
			return obj.value;
		}
	}
	//设置select多选值
	function setSelectVal(obj,v){
		if(Array.isArray(v) && obj.multiple){
			for(var i=0;i<obj.length;i++){
				obj[i].selected = v.includes(obj[i].value);
				if(obj[i].selected){
					obj[i].setAttribute('selected','selected');
				}else{
					obj[i].removeAttribute('selected');
				}
			}
		}else if(!Array.isArray(v)){
			v += '';
			for(var i=0;i<obj.length;i++){
				if(obj[i].value == v){
					obj.selectedIndex = i;
					obj.value = v;
					obj[i].selected = true;
					obj[i].setAttribute('selected','selected');
				}else{
					obj[i].selected = false;
					obj[i].removeAttribute('selected');
				}
			}
		}
	}

	//监听select的innerHTML变动
	function selectBindHTML(obj,fn){
		obj.addEventListener('DOMNodeInserted', function(e) {
			fn(obj);
		}, false)
	}

	//格式化类型
	function typeInit(com,value){
		if(!com || !com.length || value === undefined || !(value+'').length) return value;
		com = com.trim().split(':');
		value = value.toString();
		//类型值
		var val = com[1];
		if(com[0] !== 'str'){
			if(isNaN(parseFloat(value))){
				value = '';
			}else{
				value = (value+'').match(/\d+\.?\d*/);
				value = value !== null ? value[0] : '';
			}
		}
		//浮点类型
		if(com[0] === 'float'){
			if(val && value.length){
				//整数位数-小数位数
				var [l,r] = val.split('-'),reg;
				if(r>0){
					reg = new RegExp('(-?\\d{1,'+l+'}\\.\\d{0,'+r+'})|(-?\\d{1,'+l+'})');
				}else{
					reg = new RegExp('(-?\\d+\\.\\d{0,'+l+'})|(-?\\d+$)');
				}
				value = value.match(reg);
				value = value !== null ? value[0] : '';
			}
			return value;
		}
		//浮点类型 四舍五入
		if(com[0] === 'float-round'){
			if(val && value.length){
				//整数位数-小数位数
				var v = val.split('-');
				let d = value.split('.');
				if(v.length > 1){
					if(d[1] && d[1].length > v[1]) value = Number(value).toFixed(v[1]);
					d = value.split('.');
					d[0] = d[0].slice(0, v[0]);
					value = d.join('.');
				}else{
					if(d[1] && d[1].length > v[0]) value = Number(value).toFixed(v[0]);
				}
			}
			return value;
		}
		//浮点类型 限制大小
		if(com[0] === 'float-size'){
			if(val && value.length){
				//整数位数-小数位数
				var v = val.split('-');
				let d = value.split('.');
				if(+(v[0]) < value){
					value = v[0];
				}
				if(v.length > 1){
					if(+(v[0]) > value){
						//保留指定位小数
						if(d[1]) {
							d[1] = d[1].slice(0, v[1]);
							value = d.join('.')
						}
					}
				}
			}
			return value;
		}
		//浮点类型 限制大小
		if(com[0] === 'float-size-round'){
			if(val && value.length){
				//整数位数-小数位数
				var v = val.split('-');
				let d = value.split('.');
				if(v.length > 1){
					if(+(v[0]) < value){
						value = v[0];
					}else{
						//保留指定位小数
						if(d[1]) {
							value = Number(value).toFixed(v[1]);
						}
					}
				}
			}
			return value;
		}
		//整数类型
		if(com[0] === 'int'){
			if(val && value.length){
				value = (Math.floor(value) + '').slice(0, val)
			}
			return value.length ? Math.floor(value) : '';
		}
		//整数类型
		if(com[0] === 'int-size'){
			if(val && value.length){
				if(+(val) < Math.floor(value)){
					value = val;
				}
			}
			return value.length ? Math.floor(value) : '';
		}
		//整数类型 进一法
		if(com[0] === 'int-carry'){
			let d = value.split('.');
			if(d[1] && d[1].length){
				value = Math.floor(value) + 1;
			}
			if(val){
				value = (value+'').slice(0, val);
			}
			return value;
		}
		//整数类型 进一法
		if(com[0] === 'int-size-carry'){
			if(+(val) < value){
				value = val;
			}else{
				let d = value.split('.');
				if(d[1] && d[1].length){
					value = Math.floor(value) + 1;
				}
			}
			return value;
		}
		//字符类型
		if(com[0] === 'str'){
			if(val){
				value = value.slice(0, val)
			}
		}
		return value;
	}

	//消息队列
	function msg() {
        this.list = {};
    }
    msg.prototype = {
        addList: function (node,keys) {
			//将变量名称处理成这种
			//list[0].child
			//list[0]
			//list
			var arr = keys.split('');
			var str = '';
			var keyArr = [];
			for(var i=0;i<arr.length;i++){
				var s = arr[i];
				if((s == '[' || s == '.') && str.slice(-7) !== '.length'){
					keyArr.push(str);
				}
				str += s;
			}
			if(str.slice(-7) !== '.length') keyArr.push(str);
			for1:
			for(var i=0;i<keyArr.length;i++){
				var key = keyArr[i];
				//防止添加重复的消息队列
				this.list[key] = this.list[key] ? this.list[key] : [];
				//节点为for，删掉所有相关的
				for(var s=0;s<this.list[key].length;s++){
					if(node.key === 'i-for' && this.list[key][s].v.indexOf(key) === 0){
						for3:
						for(var a=0;a<node.node.itemNode.length;a++){
							if(node.node.itemNode[a].contains(this.list[key][s].node)){
								// console.log('节点为for，删掉所有相关的：', key, this.list[key][s].v)
								this.list[key].splice(s--,1);
								break for3;
							}
						}
					}
				}
				
				for(var s=0;s<this.list[key].length;s++){
					if(
						node.key !== 'i-for' && 
						this.list[key][s].key === 'i-for' && 
						keys.indexOf(this.list[key][s].v) === 0 &&
						// keys.indexOf(key) === 0 && 
						key+'.length' !== keys
					){
						// console.log('存在for，不添加该队列：',key,keys,keyArr)
						continue for1;
					}
					if(
						this.list[key][s].node == node.node && 
						this.list[key][s].key == node.key && 
						this.list[key][s].value == node.value
					){
						continue for1;
					}
				}
				this.list[key].push(node);
			}

        },
        update: function (key) {
        	// console.log('更新列队值', key)
        	if(this.list[key] && this.list[key].length){
        		this.list[key].forEach(function (node) {
	                node.update();
	            });
        	}
        },
        //删除某个节点的所有消息列队
        delList: function(node){
        	if(!node) return;
        	var that = this;

			//清除该节点下的所有节点消息列队
			var arr = [];
			!function eachNode(e){
				arr.push(e);
				e = e.childNodes;
				if (e.length) {
					for (var i = 0; i < e.length; i++) {
						eachNode(e[i]);
					}
				}
			}(node);

			for(var s=0;s<arr.length;s++){
				for(var key in that.list){
					for(var i=0;i<that.list[key].length;i++){
						//这里需要考虑到if和for的占位节点，被存储在hide中
						if(that.list[key][i].node == arr[s] || that.list[key][i].node.hide == arr[s]){
							that.list[key].splice(i--,1);
							if(!that.list[key].length){
								delete that.list[key];
								break;
							}
						}
					}
				}
			}
			//删除页面上的元素
			if(node.parentNode)node.parentNode.removeChild(node);
        }
    };
	function iceView(config,options,msgList) {
		if(options != undefined){
			if(typeof config == 'object'){
				if(config.el){
					this.el = document.querySelectorAll(config.el)[0];
				}else{
					this.el = document.getElementsByClassName('iceView')[0];
				}
			}else{
				this.el = document.querySelectorAll(config)[0];
				config = {};
			}
		}else{
			options = config;
			this.el = document.getElementsByClassName('iceView')[0];
		}
		if(!options || !this.el) return;
		var that = this;
		_this = that;
        this.data = options;
        this.msg = msgList ? msgList : new msg();
        //保存数据所有key
        this.dataKey = [];
        Object.keys(options).forEach((k)=>{
        	if(k[0]=='$'){
        		throw "iceView：声明变量或方法第一个字符不能为$";
        	}else if(k[0]=='set'){
        		throw "iceView：声明变量或方法不能为set";
        	}
        	this.dataKey.push(k);
        });
        //备份数据，不会被监听
        this.datas = cloneObj(options);
        //劫持数据
        this.kidnap(options);

		//创建div
		if(this.el.tagName == 'TEMPLATE'){
			var div = document.createElement('div');
			div.innerHTML = this.el.innerHTML;
			this.el.parentNode.insertBefore(div,this.el);
			this.el = div;
		}
		this.msg.node = this.el;
		
		//遍历所有节点
		this.eachNode(this.el);

        //初始化完成，执行回调
		this.data.set = function(json){
			for(var key in json){
				that.data[key] = cloneObj(json[key]);
				//有可能增加新值
				if(!that.dataKey.includes(key))that.dataKey.push(key);
			}
			that.kidnap(that.data)
		}
		this.data.ajax = ajax;
		this.data.change = this.data.change ? this.data.change : function(){};
        this.data.onload && this.data.onload.bind(this.data)(this.data,this.msg);
        return this;
    }
    iceView.prototype = {
    	kidnap :function(data,keyArr = []){
    		if (typeof data !== 'object') {
	            return;
	        }
			if(Array.isArray(data)){
				this.reactiveArrayProto(data,keyArr);
			}
			var len = data.length;
	        Object.keys(data).forEach((key)=>{
	        	var keyList = cloneObj(keyArr);

				var list = cloneObj(keyList);
				if(len){
					list[list.length-1] = list[list.length-1]+'['+key+']';
				}else{
					list.push(key);
				}
	            this.reactive(data, key, data[key], list);
	        });

    	},
    	//遍历对象数据
	    eachData: function (data,keyList = []) {
			if(data === null || typeof data !== 'object') return;
			if(Array.isArray(data)){
				this.reactiveArrayProto(data, keyList);
			}
			var len = data.length;
	        Object.keys(data).forEach((key)=>{
	        	var list = cloneObj(keyList);
				if(len){
					list[list.length-1] = list[list.length-1]+'['+key+']';
				}else{
					list.push(key);
				}
				
	            this.reactive(data, key, data[key],list)
	        });
	    },
		//劫持对象属性setter、getter
	    reactive: function (data, key, val, keyList) {
	    	var keys = keyList.join('.');
	        var that = this;
	        Object.defineProperty(data, key, {
			    enumerable: true,
			    configurable: true,
	            get: function () {
	                return val;
	            },
	            set: function (newVal) {
	                if (newVal === val) {
	                    return;
	                } else {
	                	val = newVal;
	                    that.datas = cloneObj(that.data);
	                    that.kidnap(newVal,keyList); //劫持新数据
						// that.kidnap(data);
	                    that.data.change && that.data.change.call(that.data);
	                    that.msg.update(keys); //发出通知
	                }
	            }
	        });

	        //递归
	        if(typeof data[key] == 'object') this.eachData(data[key],keyList);
	    },
		//劫持对象原型
		reactiveArrayProto(data, keyList) {
			// 原始Array原型  
			var originalProto = Array.prototype,
				// 创建一个Array.prototype原型对象 
				newProto = Object.create(Array.prototype),
				that = this,
				result;
			// 劫持原型对象的方法
			['push', 'pop', 'shift', 'unshift', 'short', 'reverse', 'splice'].forEach((method) => {
				Object.defineProperty(newProto, method, {
					value: function () {
						//调用原始原型上的方法
						result = originalProto[method].apply(this, arguments);
						//处理数据并更新列队
						// console.log('that.data.'+keyList.join('.'))
						// eval('that.data.'+keyList.join('.')+'=cloneObj(this)');
						// console.log(keyList.join('.'))
						that.data.change && that.data.change.call(that.data);
						that.datas = cloneObj(that.data);
						that.eachData(data,keyList);
						// eval('that.data.'+keyList.join('.')+'=this');
						that.msg.update(keyList.join('.'));
						return result;
					}
				})
			});
			// 指定劫持后的原型对象
			data.__proto__ = newProto;
		},

	    //递归编译所有子节点
	    eachNode: function (el) {
	    	this.compile(el);
	        var e = el.childNodes;
	        if (e.length) {
	            for (var i = 0; i < e.length; i++) {
	            	this.compile(e[i]);
					//为了性能，遇到for和if不再遍历子级，直接交给该元素来处理后续
	                if(e[i].nodeType == 1 && !e[i].getAttribute('i-for') && !e[i].getAttribute('i-if')){
	                	this.eachNode(e[i]);
	                }
	            }
	        }
	    },

    	//编译
	    compile: function (node) {
	    	if(node.init) return;
	    	var that = this;
	        // 节点类型为元素
	        if (node.nodeType === 1) {
				var attr = [];
	            for (let i = 0; i < node.attributes.length; i++) {
	            	let k = node.attributes[i].nodeName, v = node.attributes[i].nodeValue.trim();
	            	if(k.indexOf('i-') === 0) node[k] = v;
	            	attr.push({key:k, value:v});
	            }
				//处理bind
				let ibind = node.getAttribute('i-bind');
	            if(ibind && ibind.length){
					node.removeAttribute('i-bind');
					var arr = that.reviseEnv(ibind);
					if(Array.isArray(arr)){
						if(node.tagName == 'SELECT'){
							var value = node.getAttribute('i-value') || 'value',
							name = node.getAttribute('i-name') || 'name',
							html = '',i;
							for(i=0;i<arr.length;i++){
								html += '<option value="'+arr[i][value]+'">'+arr[i][name]+'</option>';
							}
							node.innerHTML = html;
						}
						new thread(this, node, 'i-bind', ibind);
					}
				}
        		//处理for
        		let ifor = node.getAttribute('i-for');
	            if(ifor && ifor.length){
    				node.removeAttribute('i-for');
					node.itemNode = [];

					let hide = document.createComment('for');
					hide.node = node;
                	node.hide = hide;

                	//干掉源
                	node.parentNode.replaceChild(node.hide,node);

                	new thread(this, node, 'i-for', ifor);
                	node.init = true;
                	return;
        		}else{
					node.removeAttribute('i-item');
					node.removeAttribute('i-index');
				}
				let iif = node.getAttribute('i-if');
				if(iif && iif.length) {
					node.removeAttribute('i-if');
					node.itemNode = false;
					node.nodeC = node.cloneNode(true);

					let hide = document.createComment('if');
					hide.node = node;
                	node.hide = hide;

                	//干掉源
                	node.parentNode.replaceChild(node.hide,node);

                	new thread(this, node, 'i-if', iif);
                	node.init = true;
                	return;
				}
				
				//处理value值
	            if(node.value !== undefined && node.value.length && node.tagName !== 'TEXTAREA'){
					if(node.tagName === 'SELECT' || node.tagName === 'OPTION'){
						if(node.getAttribute('value')){
							new thread(this, node, 'value', node.value, 'attr');
						}
					}else{
						new thread(this, node, 'value', node.value, 'attr');
					}
        		}
        		//处理checked值
        		let checked = node.getAttribute('i-checked');
	            if(checked && checked.length){
    				node.removeAttribute('i-checked');
	                new thread(this, node, 'i-checked', checked);
        		}
				//处理disabled值
        		let disabled = node.getAttribute('i-disabled');
	            if(disabled && disabled.length){
    				node.removeAttribute('i-disabled');
	                new thread(this, node, 'i-disabled', disabled);
        		}

	            // 解析属性
	            for (var i = 0; i < attr.length; i++) {
	                var key = attr[i].key; //属性名
	                if(key == 'value' || key == 'checked' || key == 'i-checked' || key == 'i-disabled' || key == 'i-bind'){
	                	continue;
	                }
					var value = attr[i].value; //属性值
	                var vi = value.match(reg);
					vi = vi !== null ? vi[1] : value;

					var r = vi.indexOf('.') > -1 || vi.indexOf('[') > -1 ? 1 : 0;
					if(key == 'i-type') {
						if(node.value !== undefined) {
							inputOn(node,function(){
								node.value = typeInit(node['i-type'],node.value);
							})
						}
					}
	                else if(key == 'i-model') {
	                	if(node.type == 'number' || node.type == 'text' || node.type == 'password' || node.tagName === 'TEXTAREA'){
							!function(vi,r){
								inputOn(node,function(){
									if(r){
										that.reviseEnvRun(vi+'=$[1]',node.value);
									}else{
										eval('that.data.'+vi+'=node.value');
									}
								})
							}(vi,r);
	                	}else if(node.type == 'checkbox'){
	                		//判断是否存在该值
            				if(node.checked && !that.data[vi].includes(node.value)){
            					that.data[vi].push(node.value);
            				}
	                		!function(v){
	                			node.addEventListener('click', function (e) {
		                			if(this.checked){
		                				if(!that.data[v].includes(this.value)){
		                					that.data[v].push(this.value);
			                			}
		                			}else{
		                				if(that.data[v].includes(this.value)){
											var index = that.data[v].indexOf(this.value);
											index > -1 && that.data[v].splice(index, 1);
			                			}
		                			}
			                    })
	                		}(vi);
	                	}else if(node.type == 'radio'){
	                		if(node.checked || node.getAttribute('checked')){
								if(r){
									that.reviseEnvRun(vi+'=$[1]',node.value);
								}else{
									eval('that.data.'+vi+'=node.value');
								}
	                		}
	                		!function(v){
		                		node.addEventListener('click', function (e) {
									if(r){
										that.reviseEnvRun(v+'=$[1]',this.value);
									}else{
										eval('that.data.'+v+'=this.value');
									}
			                    })
		                    }(vi);
	                	}else if(node.tagName == 'SELECT'){
							var selectValue = that.reviseEnv(vi);
							//option中也会使用for，所以需要将该值传递过去处理成选中状态
							var child = node.children;
							if(typeof selectValue === 'number' || selectValue.length){
								setSelectVal(node,selectValue);
								if(child){
									for(var item of child){
										item.selectValue = selectValue;
									}
								}
							}

							!function(vi,r,node){
								node.addEventListener('change', function () {
									let v = getSelectVal(node);
		                			if(r){
										that.reviseEnvRun(vi+'=$[1]',v);
									}else{
										eval('that.data.'+vi+'=v');
									}
								});
			                    selectBindHTML(node,(e)=>{
									//防止无限循环
			                    	if(node.bindHTML === 1) return;
			                    	node.bindHTML = 1;
									let v = that.reviseEnvRun(vi);
									setSelectVal(node,v);
									node.bindHTML = 0;
								});
		                    }(vi,r,node);
	                	}
	                    node.removeAttribute(key);
	                    new thread(this, node, key, vi);
	                }
	                else if(key == 'i-html') {
	                	node.removeAttribute(key);
	                	new thread(this, node, key, value);
	                }
	                else if(key == 'i-show') {
	                	node.removeAttribute(key);
	                	new thread(this, node, key, value);
	                }
					else if(key == 'i-src') {
	                	node.removeAttribute(key);
	                	new thread(this, node, key, value);
	                }
	                else if (key.indexOf('i-on') !== -1) {
	                	var arr = key.split('.'),type=false,keys=key;
	                	if(arr.length>1){
	                		type = arr[1],keys = arr[0];
	                	}
	                	var eventType = keys.slice(4);
	                	var fn = function(e,f){
	                		type == 'stop' && sp(e);
	                		type == 'prevent' && pd(e);
	                		if(arr[2]){
	                			type = arr[1]+arr[2];
	                			if(type == 'stopprevent' || type == 'preventstop'){
		                			sp(e),pd(e);
		                		}
	                		}
	                		f()
	                	};
						var r;
	                	if (r = value.match(reg)) {
	                		!function(code){
	                			node.addEventListener(eventType, function (e){
	                				setTimeout(()=>{
		                				fn(e,function(){
		                					that.reviseEnvRun(code);
		                				})
	                				}, 10);
	                			}, false)
	                		}(r[1]);
				        }else{
		                    var cb = this.data[value];
		                    if (value && eventType && cb) {
								!function(node,eventType,cb){
									node.addEventListener(eventType, function(e){
										setTimeout(()=>{
											fn(e,function(){
												cb.bind(that.data)(node,e);
											})
										},10)
									}, false);
								}(node,eventType,cb);
		                    }
				        }
				        node.removeAttribute(key);
	                }
					else if (key == 'i-type') {
			            new thread(this, node, key, value, 'i-type');
			        }
	                else{
		                if (reg.test(value)) {
			                new thread(this, node, key, value, 'attr');
				        }
			        }
	            }
	        }
	        // 节点类型为text
	        if (node.nodeType === 3) {
	            if (reg.test(node.nodeValue)) {
	                new thread(this, node, false, node.nodeValue);
	            }
	        }
	        node.init = true;
	    },
	    getData:function(name){
			var that = this;
			// console.log('原始字符串', name);
	    	if(name && name.length){
				name = name.replace(/\[('|")/g,'_(L)_').replace(/('|")\]/g,'_(R)_');
				name = name.indexOf('"')>name.indexOf("'") ?
					name.replace(/'[^']+'/g,' ').replace(/"[^"]+"/g,' ') :
					name.replace(/"[^"]+"/g,' ').replace(/'[^']+'/g,' ');
				name = name.replace(/_\(L\)_/g,'.').replace(/_\(R\)_/g,'');
				
				//提取所有的变量
				function rv(str){
					var arr = str.match(/(?!\.)(\b[\w\[\]\.]+)/g);
					return arr ? arr : [];
				}
				//处理中括号里的变量
				function rva(a){
					var arr1= []; //缓存
					var arr2= []; //最终列表
					//取出所有中括号里的变量
					for(var i=0;i<a.length;i++){
						if(a[i] == '['){
							arr1.push('');
							if(arr1.length == 1) continue;
						}
						if(a[i] == ']'){
							let c = arr1[arr1.length-1];
							if(!arr2.includes(c)) arr2.push(c);
							arr1.pop();
						}
						if(arr1.length){
							for(var s =0;s<arr1.length;s++){
								if(s==arr1.length-1 && a[i] == '[') continue;
								arr1[s] += a[i];
							}
						}
					}
					return arr2;
				}
				//处理中括号里的数字
				function rvass(content){
					var a = content;
					var index = a.indexOf('[');
					if(index === -1) return content;
					var str = false;
					for(var s=index;s<a.length;s++){
						var c = a[s];
						if(c === '['){
							str = str ? str : '';
						}
						if(str !== false)str += c;
						if(c === ']'){
							var l = str.split('[').length;
							var r = str.split(']').length;
							if(l === r){
								//判断中括号内是否为纯数字
								if(/^\[\s*\w+/.test(str) && !/^\[\s*\d+\s*\]$/.test(str)){
									content = a.replace(str,function(a){
										var b = a.slice(1,a.length-1).trim();
										if (b.length) {
											return '['+that.reviseEnv(b)+']';
										}
										return a;
									})
									content = rvass(content)
									break;
								}else{
									str = false;
								}
							}
						}
					}
					return content;
				}
				//处理中括号里的变量
				function rvas(arr){
					var a = [];
					for(var i=0;i<arr.length;i++){
						if(!/^\d+$/.test(arr[i])){
							a.push(rvass(arr[i]))
						}
					}
					return a;
				}

				name = rv(name);
				// console.log('提取所有的变量',name);
				var arr = [];
				for(var i=0;i<name.length;i++){
					arr = arr.concat(rva(name[i]));
				}
				name = name.concat(arr);
				name = rvas(name);
				
				// console.log('处理变量后', name);
				name = ra(name);
				return name;
	    	}
			return [];
	    },
	    //环境变量
	    reviseEnv:function($str){
	    	var $v = '',$r = '';
			var $self = this;
	    	try {
	    		(function($this){
	    			$this.dataKey.forEach((k)=>{
			    		if(typeof $this.datas[k] == 'function'){
			    			$v += 'var '+k+'=$this.datas.'+k+'.bind($this.data);';
			    		}else{
			    			$v += 'var '+k+'=$this.datas.'+k+';';
			    		}
			    	});
			    	$v += $str ? $str : '';
		    		$r = eval($v);
	    		}).call(this.data,this);
			}
			catch(err) {
				if(this.datas._debug){
					console.log($self.msg.list);
					console.log($v);
					console.log(err);
				}
			}
			return $r == undefined ? '' : $r;
	    },
		//环境变量
	    reviseEnvRun:function($str){
	    	var $v = '',$r = '';
			var $self = this;
			var $ = arguments;
	    	try {
	    		(function($this){
	    			$this.dataKey.forEach((k)=>{
			    		if(typeof $this.data[k] == 'function'){
			    			$v += 'var '+k+'=$this.data.'+k+'.bind($this.data);';
			    		}else{
			    			$v += 'var '+k+'=$this.data.'+k+';';
			    		}
			    	});
			    	$v += $str ? $str : '';
		    		$r = eval($v);
	    		}).call(this.data,this);
			}
			catch(err) {
				if(this.datas._debug){
					console.log($self.msg.list);
					console.log($v);
					console.log(err);
				}
			}
			return $r == undefined ? '' : $r;
	    },
    };
    //初始化线程
    function thread(vm, node, key, value, type) {
        msg.target = this;
        this.vm = vm;
        this.node = node;
        this.key = key;
        this.value = value;
        this.content = value;
        this.type = type;
		var arr = node.nodeType === 3 ? this.vm.getData(node.nodeValue.match(regs).join('')) : this.vm.getData(value);

		//将变量名称处理成这种
		//list[0].child
		//list[0]
		//list
		var keyArr = [];
		arr.forEach((v)=>{
			var arr = v.split('');
			var str = '';
			for(var i=0;i<arr.length;i++){
				var s = arr[i];
				if(s == '[' || s == '.'){
					keyArr.push(str);
				}
				str += s;
			}
			keyArr.push(str);
			//处理新定义属性
			if(!/^\d+/.test(keyArr[0]) && !vm.dataKey.includes(keyArr[0])){
				try {
					eval(('let '+keyArr[0]+';'));
					vm.data[keyArr[0]] = keyArr.length>1 ? [] : '';
					vm.dataKey.push(keyArr[0]);
				} catch(e) {
				}
				vm.kidnap(vm.data);
			}
		});
		
		this.update();
		arr.forEach((v)=>{
			this.v = v;
			this.vm.msg.addList(this,v);
		});
        msg.target = null;
    }
    thread.prototype = {
        update: function () {
            var that = this;
			if (this.key == 'i-bind'){
				var arr = that.vm.reviseEnv(this.value);
				if(Array.isArray(arr)){
					if(this.node.tagName == 'SELECT'){
						var value = this.node.getAttribute('i-value') || 'value',
						name = this.node.getAttribute('i-name') || 'name',
						html = '',i;
						for(i=0;i<arr.length;i++){
							html += '<option value="'+arr[i][value]+'">'+arr[i][name]+'</option>';
						}
						this.node.innerHTML = html;
					}
				}
				return;
			}
            if (this.key == 'i-for'){
				var list;
				var value = this.value.match(reg);
				if (value) {
					value = value[1];
					list = this.vm.reviseEnv(value);
				}else{
					value = this.value;
					list = this.vm.data[this.value];
				}
				if(!list || !list.length) list = []; //防止报错

				//清空所有for循环中的元素节点，包括消息列队
				var items = [], itemNodeList = [], isOk = 1;
				for(var i=0;i<this.node.itemNode.length;i++){
					if(isOk && isObjectEqual(this.node.itemNode[i].data, list[i])){
						items.push(i);
						itemNodeList.push(this.node.itemNode[i]);
						continue;
					}
					isOk = 0;
					//因为if会创建占位元素，从而加入到消息列队中
					this.vm.msg.delList(this.node.itemNode[i]);
					this.vm.msg.delList(this.node.itemNode[i].itemNode);
				}
				this.node.itemNode = itemNodeList;
				if(typeof list == 'object'){
					var itemNode = this.node.cloneNode(true);

					//获取定义的item和index
					var itemName = itemNode.getAttribute('i-item'), indexName = itemNode.getAttribute('i-index');
					itemName = itemName && itemName.length > 0 ? itemName : 'item';
					indexName = indexName && indexName.length > 0 ? indexName : 'index';
					var itemReg = new RegExp('(?!\\.)\\b'+itemName+'\\b', 'g'), indexReg = new RegExp('(?!\\.)\\b'+indexName+'(?!\\.)\\b', 'g');
					// var frag = document.createDocumentFragment();

					//处理所有的attr
					var attr = [];
					for (var s = 0; s < itemNode.attributes.length; s++) {
						let v = itemNode.attributes[s].nodeValue;
						if(reg.test(v)){
							attr.push({
								k:itemNode.attributes[s].nodeName,
								v:v
							})
						}
					}
					for(let i=0;i<list.length;i++){
						if(items.includes(i)) continue;
						//克隆节点
						var node = this.node.cloneNode(true);
						node.data = list[i];
						for (var s = 0; s < attr.length; s++) {
							node.setAttribute(attr[s].k, attr[s].v.replace(regs, (a)=>{
								if (a.length) {
									return a.replace(itemReg, value+'['+i+']').replace(indexReg, i);
								}
								return a;
							}));
						}
						node.innerHTML = node.innerHTML.replace(regs, (a)=>{
							if (a.length) {
								return a.replace(itemReg, value+'['+i+']').replace(indexReg, i);
							}
							return a;
						});
						this.node.itemNode.push(node);
						// frag.appendChild(node);
						this.node.hide.parentNode && this.node.hide.parentNode.insertBefore(node,this.node.hide);
						this.vm.eachNode(node);
					}
					//处理select
					if(this.node.selectValue != undefined){
						setSelectVal(this.node.hide.parentNode,this.node.selectValue)
					}
				}
				return;
			}

			if (this.key == 'i-if') {
            	//清空元素节点，包括消息列队
				if(this.node.itemNode){
					var value = this.vm.reviseEnv(this.value.match(reg)[1]);
					if(!Boolean(value)){
						this.vm.msg.delList(this.node.itemNode);
						this.node.itemNode = false;
					}
					return;
				} 
				this.node.itemNode = false;
				var value = this.vm.reviseEnv(this.value.match(reg)[1]);
				if(Boolean(value)){
					//克隆元素
					var itemNode = this.node.nodeC.cloneNode(true);
					//重新赋值
					this.node.itemNode = itemNode;
					//插入元素
					this.node.hide.parentNode.insertBefore(itemNode,this.node.hide);
					//遍历处理
					this.vm.eachNode(itemNode);
				}
				return;
			}

            if (this.node.nodeType == 1) {

				if(this.type == 'attr'){
					var value = this.content.replace(regs, function(a, b){
						b = b.trim();
						if (b.length) {
							return that.vm.reviseEnv(b);
						}
						return a;
					});
					this.node.setAttribute(this.key,value);
					return;
				}
				else if (this.key == 'i-type') {
					var value = this.content.replace(regs, function(a, b){
						b = b.trim();
						if (b.length) {
							return that.vm.reviseEnv(b);
						}
						return a;
					});
					this.node['i-type'] = value;
					return;
				}
				else if (this.key == 'i-show') {
					var value = this.value.match(reg);
					value = value ? this.vm.reviseEnv(value[1]) : value;
					this.node._display = this.node._display ? this.node._display : (this.node.style.display ? this.node.style.display : false);
					if(Boolean(value)){
						if(this.node._display !== 'none'){
							this.node.style.display = this.node._display;
						}else{
							this.node.style.display = null;
						}
					}else{
						this.node.style.display = 'none';
					}
					return;
				}
				else if (this.key == 'i-src') {
					var value = this.value.match(reg);
					this.node.src = value ? this.vm.reviseEnv(value[1]) : value;
					return;
				}
				else if (this.key == 'i-checked') {
					var value = this.value.match(reg);
					value = value ? this.vm.reviseEnv(value[1]) : value;
					this.node.checked = Boolean(value);
					return;
				}
				else if (this.key == 'i-disabled') {
					var value = this.value.match(reg);
					value = value ? this.vm.reviseEnv(value[1]) : value;
					if(Boolean(value)){
						this.node.setAttribute('disabled','disabled');
					}else{
						this.node.removeAttribute('disabled');
					}
					return;
				}
				else if (this.key == 'i-html') {
					var value = this.value.match(reg);
					this.node.innerHTML = value ? this.vm.reviseEnv(value[1]) : value;
                }
				
				var v = this.value;
				v = v.replace(regs, (a, b) => {
					b = b.trim();
					if (b.length) {
						return this.vm.reviseEnv(b);
					}
					return a;
				});
				try {
					this.vm.reviseEnvRun('$[1].text='+v+' !== undefined ? '+v+' : ""',this);
				}
				catch(err) {
					this.text = '';
				}
                if (this.node.tagName == 'INPUT') {
                	if(this.node.type == 'checkbox'){
                		if(this.vm.data[this.value].includes(this.node.value)){
                			this.node.checked = true;
                		}
                		return;
                	}
                	if(this.node.type == 'radio'){
                		if(this.node.value == this.vm.data[this.value]+''){
                			this.node.checked = true;
                		}
                	}else{
						this.node.value = typeInit(this.node['i-type'],this.text);
                	}
                }
                else if (this.node.tagName == 'TEXTAREA') {
                	this.node.value = this.text;
                }
                else if (this.node.tagName == 'SELECT') {
                	setSelectVal(this.node,this.text);
                }
            }else if(this.node.nodeType == 3){
				this.text = this.content.replace(regs, (a, b) => {
                    b = b.trim();
                    if (b.length) {
                    	return this.vm.reviseEnvRun(b);
                    }
                    return a;
                });
            	this.node.nodeValue = this.text;
            }
        }
    }
    return new iceView(config, options, msgList);
};