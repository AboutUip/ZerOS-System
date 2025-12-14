/**
 * ui控制器
 * 官网：https://iceui.cn
 * 创建：2016-03-02
 * 更新：2023-05-04
 * MIT License By iceui.cn
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 */
'use strict';if (typeof ice === 'undefined') throw new Error('本插件依赖ice.js，无法单独使用哦！');
//模块列表
ice.moduleList = {
	admin:   'admin/iceAdmin',    //后台框架
	code:    'code/iceCode',      //代码高亮
	run:     'run/iceRun',        //代码运行
	date:    'date/iceDate',      //时间控件
	editor:  'editor/iceEditor',  //富文本编辑器
	drag:    'drag/iceDrag',      //拖拽排序
	popup:   'popup/icePopup',    //弹出层
	succ:    'popup/icePopup',    //成功提示框
	fail:    'popup/icePopup',    //失败提示框
	warn:    'popup/icePopup',    //警告提示框
	pop:     'popup/icePopup',    //提示框
	prompt:  'popup/icePopup',    //提示弹出层
	alert:   'popup/icePopup',    //询问弹出层
	notes:   'popup/icePopup',    //小便贴弹出层
	tree:    'tree/iceTree',      //树形控件
	color:   'color/iceColor',    //颜色选择器
	view:    'view/iceView',      //模板引擎
	table:   'table/iceTable',    //数据表格
	area:    'area/iceArea',      //地区选择
	paging:  'paging/icePaging',  //分页
};
ice.module = {};
ice.each(ice.moduleList, (k, v) => {
	if (!ice[k]) {
		ice[k] = function () {
			//保存模块
			ice.module[k] = ice.module[k] ? ice.module[k] : [];
			ice.module[k].push(arguments);
			//安装模块
			return ice.moduleLoadJs(ice.path + v + '.js', k);
		};
	} else {
		console.log(k, '已存在该值');
	}
})

ice.moduleLoadJs = function (url, key) {
	if (!url) return false;
	var s = ice('script');
	for (var i = 0; i < s.length; i++) {
		if (s[i].src && s[i].src.indexOf(url) !== -1) {
			return;
		}
	}
	var head = document.getElementsByTagName('head')[0];
	var script = document.createElement('script');
	script.src = url;
	script.onload = function () {
		for (var i = 0; i < ice.module[key].length; i++) {
			var v = [];
			for (var a = 0; a < ice.module[key][i].length; a++) {
				v.push('ice.module[key][i][' + a + ']');
			}
			eval('ice.' + key + '(' + v.join(',') + ')');
		}
	};
	head.appendChild(script);
};
var ui = {
	version: '2.0.4',
	//关闭弹窗
	closePopup(){
		ice('#_popup').children('div').del();
	},
	//加载中动画
	load(type = 3) {
		var div = ice.c('div');
		div.className = 'loading';
		div.innerHTML = '<div class="loader loader-' + type + '"></div>';
		ui.body.append(div);
	},
	//关闭加载中
	loadClose() {
		ice('.loading').fadeOut();
		setTimeout(function () {
			ice('.loading').del();
		}, 500);
	},
	//删除
	del(url, text) {
		url = typeof (url) == 'object' ? url.href : url;
		text = text || '确认要删除？删除后将无法恢复！';
		ice.sp();
		ice.prompt({
			content: text,
			btn: ['取消', '确认'],
			yes() {
				window.location.href = url;
			}
		});
		return false;
	},
	//注册事件
	reg(type, fn) {
		ui.event[type].push(fn);
	},
	//表格排序
	table(options) {
		options = options || {};
		var el = typeof options.el == 'object' ? options.el : document.getElementById(options.el);
		var sort = options.sort != undefined ? options.sort.split(',') : false;
		var callback = options.success || function () { };
		if (!el || el.length || el.tagName != 'TABLE' || el.rows.length <= 1 || el.init) return;
		el.init = 1;
		//定义变量
		var rows = [], thead = [], first = [], last = null;
		//获取每行对象
		ice.each(el.rows, function () {
			rows.push(this);
		});
		//如果sort参数定义，按照sort初始化，默认每列可自由排序
		thead = rows.shift().cells;
		for (var i = 0; i < (sort ? sort.length : thead.length); i++) {
			var s = sort ? sort[i] : i;
			if (s >= thead.length) continue;
			first[s] = false;
			ice.addCss(thead[s], 'table-sort');
			thead[s].innerHTML += '<span class="table-sort-arrow"></span>';
			thead[s].i = s;
			thead[s].onclick = function () { sortFn(this.i) };
		}
		//排序
		function sortFn(col) {
			if (last) {
				ice.delCss(last, 'table-sort-asc');
				ice.delCss(last, 'table-sort-desc');
			}
			var sortNum = true;
			for (var i = 0; i < rows.length && sortNum; i++) {
				sortNum = /^\d+(\.\d+)?$/.test(rows[i].cells[col].innerHTML);
			}
			rows.sort(function (row1, row2) {
				var result;
				var value1, value2;
				value1 = row1.cells[col].innerHTML;
				value2 = row2.cells[col].innerHTML;
				if (value1 == value2) return 0;
				result = sortNum ? parseFloat(value1) > parseFloat(value2) : value1 > value2;
				result = result ? 1 : -1;
				return result;
			})
			if (first[col]) {
				rows.reverse();
				first[col] = false;
				ice.delCss(thead[col], 'table-sort-asc');
				ice.addCss(thead[col], 'table-sort-desc');
			} else {
				first[col] = true;
				ice.delCss(thead[col], 'table-sort-desc');
				ice.addCss(thead[col], 'table-sort-asc');
			}
			last = thead[col];
			var frag = document.createDocumentFragment();
			ice.each(rows, function () {
				frag.appendChild(this);
			});
			el.tBodies[0].appendChild(frag);
			callback(thead[col], first[col]);
		}
	},
	//单文件上传
	singleFileUpload() {
		var el = ice('.iceUpload-single');
		if (el.length) {
			el.each(function () {
				var input = ice('input', this)[0];
				var btn = ice('.btn', this)[0];
				var img = ice(this).attr('data-img');
				var url = ice(this).attr('data-url');
				var name = ice(this).attr('data-name');
				var accept = ice(this).attr('data-accept');
				var successFn = ice(this).attr('data-success');
				var errorFn = ice(this).attr('data-error');
				var completeFn = ice(this).attr('data-complete');
				var click = ice(this).attr('data-click');
			  if(/^\w+(\.|\w)+\w+$/.test(url)) url = window['eval'].call(window, url);
				if(btn){
					click = btn;
				}else if(click){
					if(click === 'true'){
						click = ice(this)[0];
						ice(this).css('cursor','pointer');
					}else{
						click = ice(click) ? ice(click)[0] : false;
					}
				}
				if (img) {
					var imgObj = ice('img', this);
					if (imgObj.length) {
						img = imgObj[0];
					} else {
						img = ice.c('img');
						img.className = 'ani-up-in'
						img.style.display = 'none';
						ice(this).prepend(img);
					}
				}
				var upload = function (name, file) {
					if(btn) btn.innerHTML = '上传中，请稍后';
					var formData = new FormData();
					formData.append(name, file);
					ice.ajax({
						url: url,
						data: formData,
						success: function (res) {
							if (!res.error) {
								if (img) {
									img.src = res.url + '?v=' + ice.cid();
									img.style.display = 'block';
								}
								if(btn) btn.innerHTML = '<i class="icon ice-check-line"></i>上传成功';
								successFn && window[successFn] && window[successFn](res);
							} else {
								if(btn) btn.innerHTML = '<i class="icon ice-close-line"></i>上传失败';
								errorFn && window[errorFn] && window[errorFn](res);
								ice.fail(res.message);
							}
							completeFn && window[completeFn] && window[completeFn](res);
						}
					})
				};
				if (input) {
					input.onchange = function () {
						//截取文件名称
						if (img) {
							var res = new FileReader();
							res.readAsDataURL(this.files[0]);
							res.onload = function (oFREvent) {
								img.src = oFREvent.target.result;
								img.style.display = 'block';
							}
						}
						if(btn) btn.innerHTML = '<i class="icon ice-check-line"></i>已选择';
					}
				}
				if(click){
					click.onclick = function () {
						if (!input) {
							if (!url || !name) {
								ice.fail('url或name不能为空');
								return;
							}
							//创建input
							var inputs = ice.c('input');
							inputs.type = 'file';
							inputs.name = name;
							inputs.accept = accept ? accept : 'image/*';
							inputs.oninput = function () {
								upload(name, this.files[0]);
							};
							inputs.click();
							return false;
						}
						input.click();
						return false;
					}
				}
			})
		}
	},
	//单文件上传-拖拽异步方式
	singleFileDragUpload() {
		var el = ice('.iceUpload-single-drag');
		if (el.length) {
			el.each(function (i, o) {
				var icon = ice('.icon', this);
				var title = ice('.iceUpload-single-title', this);
				var url = ice(this).attr('data-url');
				var name = ice(this).attr('data-name');
				var accept = ice(this).attr('data-accept');
				var successFn = ice(this).attr('data-success');
				var errorFn = ice(this).attr('data-error');
				var completeFn = ice(this).attr('data-complete');
			  if(/^\w+(\.|\w)+\w+$/.test(url)) url = window['eval'].call(window, url);
				var upload = function (file) {
					var formData = new FormData();
					formData.append(name, file);
					ice.ajax({
						url: url,
						data: formData,
						success: function (res) {
							if (!res.error) {
								if (icon.length) icon[0].className = 'icon ice-check-line';
								title.length && title.html('上传成功');
								successFn && window[successFn] && window[successFn](res);
							} else {
								if (icon.length) icon[0].className = 'icon ice-close-line';
								title.length && title.html('上传失败');
								errorFn && window[errorFn] && window[errorFn](res);
								ice.fail(res.message);
							}
							ice(o).delCss('iceUpload-single-active');
							completeFn && window[completeFn] && window[completeFn](res);
						}
					})
				};
				//点击上传
				this.onclick = function () {
					if (!url || !name) {
						ice.fail('url或name不能为空');
						return;
					}
					//创建input
					var input = ice.c('input');
					input.type = 'file';
					input.name = name;
					input.accept = accept ? accept : 'image/*';
					input.oninput = function () {
						upload(this.files[0]);
					};
					input.click();
					return false;
				};
				this.ondragover = function () {
					return false;
				};
				//移入到放置目标时执行
				this.ondragenter = function () {
					ice(this).addCss('iceUpload-single-active');
				};
				//移出到放置目标时执行
				this.ondragleave = function () {
					ice(this).delCss('iceUpload-single-active');
				};
				//放置在目标区域时触发
				this.ondrop = function (e) {
					ice.sp(e);
					if (!url || !name) {
						ice.fail('url或name不能为空');
						return;
					}
					upload(e.dataTransfer.files[0]);
					return false;
				}
			})
		}
	},
	//美化所有的select
	select(el = '.select') {
		var connectList = {};
		ice(el).each(function () {
			if (this.tagName !== 'SELECT' || this.select === true) return;
			if (this.select) {
				this.style.display = null;
				ice(this.select).del();
				this.select = true;
			}
			var selValue = this.getAttribute('value');

			//处理异步接口请求过来的数据
			var _this = this;
			var url = this.getAttribute('data-url');
			if(/^\w+(\.|\w)+\w+$/.test(url)) url = window['eval'].call(window, url);
			if (url && _this.ajax !== 2) {
				if (_this.ajax == 1) return;
				_this.ajax = 1;
				var type = this.getAttribute('data-ajax') || 'post';
				var param = this.getAttribute('data-param');
				param = param ? ice.jsonDecode(param) : param;
				ice.ajax({
					url: url,
					type: type,
					data: param,
					success(res) {
						var list = res;
						var listName = _this.getAttribute('data-list');
						if (listName) {
							list = eval('res.' + listName);
						}
						if (list && list.length) {
							var value = _this.getAttribute('data-value') || 'value';
							var name = _this.getAttribute('data-name') || 'name';
							var option = '';
							list.forEach((v) => {
								option += `<option value="${v[value]}">${v[name]}</option>`;
							})
							_this.innerHTML = option;
							if (selValue) ice(_this).val(selValue);
							initSelect.call(_this);
							_this.ajax = 2;
						}
					}
				})
			} else {
				if (selValue) ice(this).val(selValue);
				initSelect.call(this);
			}
			function initSelect() {
				var html = '', _this = this, obj = ice(this);
				if (obj.length && this[0].innerHTML.length) {
					setTimeout(() => { this.removeAttribute('value') }, 500);
					if (!this.multiple) {
						var isSel = 0;
						ice(this.options).each(function (i) {
							if (this.getAttribute('selected') !== null) {
								isSel = 1;
								return false;
							}
						})
						if (!isSel && this.options[0].selected == true) {
							this.selectedIndex = -1;
							this.options[0].selected = false;
							this.value = '';
						}
					}
					obj.childrens().each(function () {
						if (this.tagName === 'OPTGROUP') {
							_this.group = 1;
							var label = this.getAttribute('label');
							if (label && label.length) {
								html += '<li class="select-name">' + label + '</li>';
							}
							return;
						}
						if (this.className == 'select-empty') {
							html += '<li class="select-empty">(空)</li>';
							return;
						}
						var val = this.getAttribute('value');
						var active = _this.value == val ? ' class="select-active"' : '';
						var vals = val ? ' data-value="' + val + '"' : '';
						html += '<li' + vals + ' ' + active + '>' + this.label + '</li>';
					});
				} else {
					this.innerHTML = '<option></option>';
					obj = ice(this);
					html += '<li class="select-empty">(空)</li>';
				}

				let connect = this.getAttribute('data-connect');
				var box = ice.c('div');
				if (connect) {
					if (!connectList[connect]) connectList[connect] = [];
					connectList[connect].push(box);
					//如果为多级联动，暂时隐藏
					box.style.display = 'none';
					box.connect = connectList[connect].length;
				}
				var search = this.getAttribute('data-search') == 'true' ? 1 : 0;
				box.className = this.getAttribute('class') + (this.multiple ? ' select-multiple' : '') + (search ? ' select-search' : '');
				if (this.getAttribute('style')) ice(box).attr('style', this.getAttribute('style'));
				var setName = this.getAttribute('data-title');
				setName = (setName && setName !== 'false') ? setName : '请选择';
				box.innerHTML = `<input class="select-title" ${search ? '' : 'readonly="readonly"'} placeholder="${setName}"/><div class="select-clear">✕</div><div class="select-tag"></div><ul class="select-ul scrollbar">${html}</ul>`;
				box.onclick = function () {
					obj[0].click();
				}
				obj.after(box).hide();
				this.select = box;

				var ul = ice('ul', box), li = ul.find('li'), title = ice('.select-title', box), clear = ice('.select-clear', box), tag = ice('.select-tag', box), objBox = ice(box);
				_this.clear = clear;

				ice.on(document, 'click', function () {
					ul.hide();
					objBox.delCss('select-open');
				});
				if (this.disabled) objBox.addCss('select-disabled'),title.attr('readonly','readonly');
				if (this.group) ul.addCss('select-group');

				//搜索
				if (search) {
					title[0].oninput = function () {
						var html = '';
						var list = [];
						for (let i = 0; i < _this.length; i++) {
							let item = {};
							let name = _this[i].label;
							if (this.value) {
								if (!_this.multiple) {
									//如果关键字完全等于选择项，直接选中
									if (this.value === name) {
										obj.val(_this[i].value);
									}
								}
								let rege = new RegExp('([' + this.value.split('').join('|') + ']{1})', 'g');
								if (rege.test(name)) {
									name = name.replace(rege, '<span>$1</span>');
									item.count = name.split('<span>').length;
									item.name = name;
									item.value = _this[i].value;
									list.push(item);
								}
							} else {
								html += `<li data-value="${_this[i].value}">${name}</li>`;
							}
						}
						if (list.length) {
							//根据匹配的关键字数量排序
							list.sort(function (a, b) {
								return b.count - a.count;
							}).forEach((v) => {
								html += `<li data-value="${v.value}">${v.name}</li>`;
							})
						}
						ul.html(html.length ? html : '<li class="select-empty">(空)</li>');
						//重新设置点击事件
						li = ul.find('li');
						liClick();
					}
				}

				if (this.getAttribute('data-clear') !== 'false') {
					clear[0].onclick = function () {
						ice.sp()
						objBox.delCss('select-sel');
						title[0].value = '';
						obj.val('');
						obj.trigger('change');
						obj.trigger('click', false);
					}
				} else {
					objBox.addCss('select-no-clear');
				}

				//下拉操作
				objBox.click(function () {
					ice.sp();
					ice('.select ul').hide();
					ice('.select').delCss('select-open');
					if (obj[0].disabled) {
						return;
					}
					var pos = ice(this).page();
					ul.css({
						'min-width': box.offsetWidth + 'px',
						top: pos.y - ice.scroll().y + this.offsetHeight + 'px',
						left: pos.x - ice.scroll().x + 'px',
						display: 'block',
					});
					objBox.addCss('select-open');
					obj.trigger('click', false);
					ice.on(window, 'scroll', function () {
						if (ul[0].style.display != 'none') {
							ul.css({
								transition: 'none',
								top: pos.y - ice.scroll().y + box.offsetHeight + 'px',
								left: pos.x - ice.scroll().x + 'px',
							});
						}
					});
				});

				// 监听selected的变化
				ice(this.options).each(function (i) {
					var that = this;
					var v = this.selected;
					!function (i) {
						Object.defineProperty(that, 'selected', {
							enumerable: true,
							configurable: true,
							get: function () {
								return v;
							},
							set: function (newVal) {
								if (v === newVal) return;
								v = newVal;
								that.selected = v;

								if (v) {
									_this[i].setAttribute('selected', 'selected');
								} else {
									_this[i].removeAttribute('selected');
								}

								if (!_this.isChange) ui.select(_this);
							}
						});
					}(i);
					if (_this.multiple) {
						if (this.selected) {
							addItem(i)
						}
					} else {
						if (this.value === _this.value) {
							title.val(this.label);
						}
					}
				})
				if (!_this.multiple && title[0].value.length) {
					objBox.addCss('select-sel');
				}
				//删除选中项
				function delItem(i) {
					i = +(i);
					var that = li.s(i);
					_this.isChange = true;
					_this.options[i].selected = false;
					_this[i].removeAttribute('selected');
					that.delCss('select-active');
					tag.find('[data-index="' + i + '"]').del();
					if (!ul.find('.select-active').length) {
						title.val('');
					}
					var pos = objBox.page();
					ul.css({
						transition: 'none',
						top: pos.y - ice.scroll().y + box.offsetHeight + 'px',
						left: pos.x - ice.scroll().x + 'px',
					});
					_this.isChange = false;
					obj.trigger('change');
					obj.trigger('click', false);
				}
				//添加选中项
				function addItem(i) {
					i = +(i);
					var that = li.s(i);
					_this.isChange = true;
					_this[i].selected = true;
					_this[i].setAttribute('selected', 'selected');
					tag.append(`<div data-index="${i}">${that.text()}<span>✕</span></div>`);
					that.addCss('select-active');
					var pos = objBox.page();
					ul.css({
						transition: 'none',
						top: pos.y - ice.scroll().y + box.offsetHeight + 'px',
						left: pos.x - ice.scroll().x + 'px',
					});
					tag.find('span').click(function () {
						ice.sp();
						delItem(ice(this.parentNode).attr('data-index'));
					})
					_this.isChange = false;
					obj.trigger('change');
					obj.trigger('click', false);
				}

				//选择项目
				function liClick() {
					li.click(function (i) {
						ice.sp();
						var that = ice(this);
						if (that.hasCss('select-name')) {
							return;
						} else if (that.hasCss('select-empty')) {
							ice('.select ul').hide();
							ice('.select').delCss('select-open');
							return;
						}
						if (_this.multiple) {
							//取消选中
							if (that.hasCss('select-active')) {
								delItem(i);
							} else {
								addItem(i)
							}
						} else {
							objBox.addCss('select-sel');
							li.delCss('select-active');
							var val = that.addCss('select-active').attr('data-value');
							title.val(this.innerHTML.replace(/<[^>]+>/g, ''));
							obj.val(val ? val : '');

							//如果为多级联动，需要处理
							if (connect && connectList[connect][box.connect]) {
								ice(connectList[connect][box.connect]).show();
							}
							//回调函数
							var change = _this.getAttribute('onchange');
							if (change) {
								if (change.indexOf('(') > -1) {
									var name = change.split('(');
									var arg = change.match(/\((.*?)\)/);
									if (arg && arg[1]) {
										eval(name[0] + '.call(obj[0],' + arg[1] + ')');
									}
								} else {
									eval(obj.attr('onchange') + '.call(obj[0], val, li.text())')
								}
							} else {
								obj.trigger('change');
								obj.trigger('click', false);
							}
							ul.hide();
						}
					});
				}
				liClick();
			}
		});

		//多级联动
		ice.each(connectList, function () {
			ice(this[0]).show(); //将第一个下拉选择显示出来
		})
	},
	//格式化select选项列表
	setSelect(el, arr) {
		if (typeof arr !== 'object') return console.log('ui.setSelect(el,arr): arr参数错误，请检查！');
		var html = '';
		if (Array.isArray(arr)) {
			arr.forEach((v) => {
				if (v.value !== undefined && v.name !== undefined) {
					html += `<option value="${v.value}"${v.selected ? ' selected="selected"' : ''}${v.disabled ? ' disabled="disabled"' : ''}>${v.name}</option>`;
				}
			})
		} else {
			arr.value = arr.value || 'value';
			arr.name = arr.name || 'name';
			arr.selected = arr.selected || 'selected';
			arr.disabled = arr.disabled || 'disabled';
			arr.list = arr.list || [];
			if (!arr.list || !arr.list.length) return;
			if (arr.group) {
				arr.list.forEach((v) => {
					if (v.name !== undefined) {
						html += `<optgroup label="${v.name}">`;
						v.list.forEach((item) => {
							if (arr.value !== undefined && arr.name !== undefined) {
								html += `<option value="${item[arr.value]}"${item[arr.selected] ? ' selected="selected"' : ''}${item[arr.disabled] ? ' disabled="disabled"' : ''}>${item[arr.name]}</option>`;
							}
						})
						if (!v.list.length) {
							html += `<option class="select-empty">(空)</option>`;
						}
						html += `</optgroup>`
					}
				})
			} else {
				arr.list.forEach((v) => {
					if (arr.value !== undefined && arr.name !== undefined) {
						html += `<option value="${v[arr.value]}"${v[arr.selected] ? ' selected="selected"' : ''}${v[arr.disabled] ? ' disabled="disabled"' : ''}>${v[arr.name]}</option>`;
					}
				})
			}
		}
		ice(el).each(function () {
			this.innerHTML = html;
		})
		ui.select();
	},
};
ice.init.prototype.select = function (obj) {
	return ui.setSelect(this, obj)
};
ice.init.prototype.clear = function (obj) {
	this.each(function () {
		this.clear.click();
	})
};

//事件
ui.event = [];
ui.event['scroll'] = []; //监听滚动条滚动
ui.event['resize'] = []; //监听窗口大小改变
ui.event['load'] = [];   //onload后，只执行一次
//导航
ui.nav = {};
//导航滑动线默认开启
ui.nav.line = true;

//将事件统一执行，不但代码美观，性能还有一定的提升。
//监听滚动条滚动
ice.on(window, 'scroll', function () {
	for (var i = 0; i < ui.event['scroll'].length; i++) {
		ui.event['scroll'][i](ice.scroll());
	}
});
//监听窗口大小改变
ice.on(window, 'resize', function (e) {
	ui.webW = ice.web().w;
	ui.webH = ice.web().h;
	for (var i = 0; i < ui.event['resize'].length; i++) {
		ui.event['resize'][i](ice.web().w, ice.web().h);
	}
});
//监听程序加载完以后
ice.on(window, 'load', function () {
	for (var i = 0; i < ui.event['load'].length; i++) {
		ui.event['load'][i]();
	}
});

//初始化ui框架的前端页面
ui.init = function () {
	ui.event['node'] = [];   //onload后，遍历所有节点，只执行一次
	ui.event['scroll'] = []; //监听滚动条滚动
	ui.event['resize'] = []; //监听窗口大小改变
	ui.event['load'] = [];   //onload后，只执行一次

	//定义变量
	ui.webW = ice.web().w;
	ui.webH = ice.web().h;
	ui.body = ice('body');

	//loading加载动画
	!function () {
		if (ui.body.initLoading) return;
		ui.body.initLoading = 1;
		if (ui.body.attr('data-load')) {
			var load = ice('.loading');
			if (load.length) {
				ui.reg('load', function () {
					load.fadeOut();
				});
			} else {
				var loadType = ui.body.attr('data-load-type');
				loadType = loadType ? loadType : 3;
				var loadDiv = ice.c('div');
				loadDiv.className = 'loading';
				loadDiv.innerHTML = '<div class="loader loader-' + loadType + '"></div>';
				ui.body.append(loadDiv);
				ui.reg('load', function () {
					ice(loadDiv).fadeOut();
				});
			}
		}
	}();

	//导航超过屏幕高度或banner高度后设置背景颜色
	//后续需要优化，词语不够规范
	ui.navAutoBg = ice('.auto-navbg');
	!function () {
		if (ui.navAutoBg.length) {
			ui.banner = ice('.banner');
			!function () {
				let a = ui.navAutoBg.attr('data-setAutoBg');
				var h = a == 'wh' ? ui.webH : false;
				if (!h) {
					if (!ui.banner.length) return false;
					h = ui.banner[0].offsetTop + ui.banner[0].offsetHeight;
				}
				ice.on(window, 'scroll', function () {
					if (ice.scroll().y > h - ui.navAutoBg[0].offsetHeight) {
						ui.navAutoBg.addCss('auto-navbg-on');
					} else {
						ui.navAutoBg.delCss('auto-navbg-on');
					}
				});
			}();
		}
	}();

	//处理所有的code标签
	!function () {
		ice('code').each(function () {
			if (this.initCode) return;
			this.initCode = 1;
			var s = this.innerHTML;
			this.innerHTML = s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		})
	}();

	//滚动条加载class事件
	//注册滚动条滚动事件
	ui.scroll = [];
	ui.reg('node', function (a) {
		var scroll = ice(a);
		var css = scroll.attr('data-scroll-class'); //为空则默认不进行任何操作，这里需要添加class，注意，只能为class！不能为id？抱歉，使用id没有意义
		if (css) {
			var top = scroll.attr('data-scroll-top');     //为空则默认为元素的总高
			var delay = scroll.attr('data-scroll-delay'); //为空则默认为0，单位ms
			var type = scroll.attr('data-scroll-type');   //为空则默认为one(固定)，有效值：auto(随滚动条自动变化)，one(只执行一次，就固定了)
			var view = scroll.attr('data-scroll-view');   //为空则默认为bottom(视口上面)，有效值：top(元素在视口上面时触发)，bottom(元素在视口下面时触发)
			var info = [];
			info['delay'] = delay ? parseInt(delay) : 0;
			info['type'] = type ? type : 'one';
			info['view'] = view ? view : 'bottom';
			info['class'] = css;
			if (top == 'view') top = ice.web().h;
			info['top'] = top ? parseInt(top) : scroll.page().y;
			if (!top && info['view'] == 'bottom') info['top'] -= ui.webH;
			info['el'] = scroll;
			ui.scroll.push(info);
		}
	});
	//注册滚动条滚动事件
	ui.reg('scroll', function (scroll) {
		ice.each(ui.scroll, function () {
			if (this.top <= scroll.y) {
				!function (a) { setTimeout(function () { a.el.addCss(a.class) }, a.delay) }(this);
			} else {
				if (this.type == 'auto') this.el.delCss(this.class);
			}
		});
	});

	//滚动到该元素位置
	!function () {
		ui.reg('node', function (a) {
			var scroll = ice(a);
			var e = scroll.attr('data-scroll');
			if (e) {
				var obj = ice(e);
				if (obj.length) {
					var offset = scroll.attr('data-offset');
					var num = 0;
					if (offset) {
						if (/\s/.test(offset)) {
							var arr = offset.split(' ');
							var el = ice(arr[0]);
							if (el.length) num += el[0].offsetHeight;
							num += +(arr[1]);
						} else {
							if (+(offset)) {
								num = +(offset);
							} else {
								var el = ice(offset);
								if (el.length) num = el[0].offsetHeight;
							}
						}
					}
					scroll.click(function () {
						ice.scrollAni(obj, num);
					})
				}
			}
		});
	}();

	//文字单个逐步加载动画
	!function () {
		var ani = ice('.ani-one-in');
		if (ani.length) {
			ani.each(function () {
				if (ice(this).attr('data-ani-one-in') == 'true') return;
				ice(this).attr('data-ani-one-in', 'true');
				var str = this.innerHTML.replace(/&nbsp;/g, ' ').split('');
				for (var a = 0; a < str.length; a++) {
					str[a] = '<span style="transition-delay:' + (a / 10) + 's;">' + (str[a] === ' ' ? '&nbsp;' : str[a]) + '</span>';
				}
				this.innerHTML = str.join('');

				//根据滚动条判断动画项是否出现在视口里面
				if (ice.page(this).y <= ice.scroll().y + ui.webH) ice.addCss(this, 'ani-show');
			});
		}
	}();

	//导航滚动逐步加载动画
	!function () {
		var ani = ice('.ani');
		if (ani.length) {
			ani.each(function () {
				this.ani = 0;
				this.s = ice.attr(this, 'data-ani-delay');
				this.s = this.s ? parseInt(this.s) : 100;
				this.t = ice.page(this).y - ui.webH - this.offsetHeight;
				//根据滚动条判断动画项是否出现在视口里面
				if (this.t <= ice.scroll().y) {
					!function (a) {
						setTimeout(function () { ice.addCss(a, 'ani-show') }, a.s);
					}(this);
				}
			});
			//根据滚动条判断动画项是否出现在视口里面
			ui.reg('scroll', function (e) {
				ani.each(function () {
					if (!this.ani && this.t <= e.y) {
						!function (a) {
							setTimeout(function () { ice.addCss(a, 'ani-show'), a.ani = 1; }, a.s);
						}(this);
					}
				});
			});
		}
	}();

	//导航滚动动画
	!function () {
		!function run(a) {
			var ani = ice('.ani-scroll-' + a);
			if (ani.length) {
				ani.each(function () {
					this.t = ice.page(this).y + this.offsetHeight;
					this.s = this.t < ui.webH ? 0 : this.t - ui.webH;
				});
				ui.reg('scroll', function (e) {
					ani.each(function () {
						var x = a == 'l' ? ~(e.y - this.s) / 4 : (e.y - this.s) / 4;
						ice(this).css({
							transform: 'translate3d(' + x + 'px, 0, 0)'
						})
					})
				})
			}
			return run;
		}('l')('r');
	}();

	//input正则限制
	ui.reg('node', function (a) {
		if(a.tagName === 'INPUT'){
			var input = ice(a);
			var reg = input.attr('data-reg'); 
			if(reg){
				reg = new RegExp(reg);
				input.on('input',function(){
					var v = this.value.match(reg);
					this.value = v ? v[0] : '';
				})
				input.on('blur',function(){
					reg.test(this.value) ? input.delCss('error') : input.addCss('error');
				})
			}
		}
	});

	//鼠标跟随-圆点
	!function () {
		var follow = ice('.follow-disc');
		if (follow.length) {
			follow[0].style.display = 'block';
			var w = follow[0].offsetWidth / 2;
			ice('body').on('mousemove', function (i, o, ev) {
				follow.css({
					transform: 'translate3d(' + (ev.x - w) + 'px, ' + (ev.y - w) + 'px, 0)'
				})
			});
			ice('body a').on('mouseover', function () {
				follow.addCss('follow-a');
			});
			ice('body a').on('mouseout', function () {
				follow.delCss('follow-a');
			});
		}
	}();

	//导航滚动数字变化加载
	!function () {
		var ani = ice('.ani-num');
		if (ani.length) {
			var aniFn = function (el, e) {
				if (el.rollNum == 1) {
					if (el.t <= e.y) {
						el.rollNum = 0;
						setTimeout(function () {
							var s = parseInt(el.num / 20); //取整，用来均衡所有数字的递增速度
							var i = 0;
							!function run() {
								setTimeout(function () {
									i += s ? s : 1;
									if (i < el.num) {
										el.innerHTML = ice.prefixZero(i, el.l);
										run();
									} else {
										el.innerHTML = el.num;
									}
								}, 30);
							}();
						}, el.s);
					}
				}
			};
			ani.each(function () {
				this.num = +(this.innerHTML.trim());
				if (!this.num) return;
				this.l = this.num.toString().length;
				this.innerHTML = ice.prefixZero(0, this.l);
				this.s = ice.attr(this, 'data-ani-delay');
				this.s = this.s ? parseInt(this.s) : 100;
				this.rollNum = 1;
				var that = this;
				setTimeout(function () {
					that.t = ice.page(that).y - ui.webH;
					//根据滚动条判断动画项是否出现在视口里面
					aniFn(that, ice.scroll());
				}, 0)
			});
			//根据滚动条判断动画项是否出现在视口里面
			ui.reg('scroll', function (e) {
				ani.each(function () {
					aniFn(this, e);
				});
			});
		}
	}();

	//图片点击预览
	ice('.img-view').click(function () {
		if (this.tagName !== 'IMG') return;
		var imgBox = ice.c('div');
		imgBox.className = 'iceui-img-view';
		imgBox.innerHTML = `<img src="${this.src}" class="ani-down-in"/>`;
		imgBox.onclick = function () {
			ice(imgBox).addCss('ani-out');
			setTimeout(function () {
				ice(imgBox).del();
			}, 500)
		}
		document.body.appendChild(imgBox);
	})

	ui.reg('node', function (el) {
		//弹出层
		var open = ice.attr(el, 'data-open');
		if (open) {
			var openObj = ice(open);
			if (openObj.length) {
				var css = ice(el).attr('data-ani');
				if (css) openObj.addCss('ani-' + css);
				if (openObj.hasCss('none')) {
					openObj.hide();
					openObj.delCss('none');
				}
				el.onclick = function () {
					openObj.toggle();
					ice.sp();
				}
				openObj.find('.close').on('click', function () {
					openObj.hide();
				})
			}
		}

		//小便贴
		var notes = ice.attr(el, 'data-notes');
		if (notes.length && !el.notes) {
			el.notes  = 1;
			var json = /\{([^\}][\s\S]+?)\}/g.test(notes) ? ice.jsonDecode(notes) : eval(notes);
			json.obj = el;
			ice.notes(json);
		}

		//视差背景图
		var parallax = ice.attr(el, 'data-img-parallax');
		if (parallax) {
			el.style.backgroundImage = 'url(' + parallax + ')';
			ice.addCss(el, 'img-parallax');
		}

		//表格排序
		var sort = ice.attr(el, 'data-table-sort');
		if (sort) ui.table({ el: el, sort: sort == 'true' ? false : sort });
	});

	//图标按钮开关
	ice('.toggle-menu').on('click', function () { ice(this).toggleCss('open') }); //菜单图标
	ice('.toggle-more').on('click', function () { ice(this).toggleCss('open') }); //更多图标

	//导航下拉菜单
	ui.nav.toggle = ice('.nav-wap .toggle-menu')[0];
	ui.nav.menu = ice('.nav-menu')[0];
	ice('.nav-list li').on('click', function () {
		ice('.click', this).each(function (i) {
			ice(this).delCss('click');
		});
		ice(this).toggleCss('click');
		ice.sp();
	});

	//导航条滑动
	!function () {
		if (ui.nav.menu) {
			clearInterval(ui.nav.timer);
			var line = ice('.nav-line');
			if (!line.length) {
				line = ice.c('div');
				line.className = 'nav-line';
				ui.nav.menu.appendChild(line);
			} else {
				line = line[0];
			}

			//菜单高亮
			ice('.nav-list a').each(function () {
				if (this.href === document.location.href || document.location.href.indexOf(this.href) === 0) {
					ice('.nav-list li').delCss('active');
					this.parentNode.className = 'active';
				}
			});
			var i, speed = 0, changeWidth, sports, obj = ice('.nav-list li'), active = ice('.nav-list .active')[0];
			sports = function (n, m) {
				ui.nav.timer = setInterval(function () {
					speed = (n - line.offsetLeft) / 10;
					speed = speed > 0 ? Math.ceil(speed) : Math.floor(speed);
					if (line.offsetLeft === n) {
						clearInterval(ui.nav.timer);
					} else {
						line.style.left = line.offsetLeft + speed + 'px';
					}
					changeWidth = m - line.offsetWidth;
					changeWidth = changeWidth > 0 ? Math.ceil(speed) : Math.floor(speed);
					line.style.width = m + changeWidth + 'px';
				}, 20);
			}
			if (!active) {
				active = [];
				active.offsetWidth = obj[0].offsetWidth;
				active.offsetLeft = obj[0].offsetLeft;
			}
			sports(active.offsetLeft, active.offsetWidth);
			for (i = 0; i < obj.length; i += 1) {
				obj[i].onclick = function () {
					var el = this;
					//下拉菜单，保持父级菜单高亮
					if (ice(this.parentNode).hasCss('nav-dropdown')) {
						el = this.parentNode.parentNode;
					}
					active = [];
					active.offsetWidth = el.offsetWidth;
					active.offsetLeft = el.offsetLeft;
					clearInterval(ui.nav.timer);
					sports(el.offsetLeft, el.offsetWidth);
				};
				obj[i].onmouseover = function () {
					clearInterval(ui.nav.timer);
					sports(this.offsetLeft, this.offsetWidth);
				};
				obj[i].onmouseout = function () {
					clearInterval(ui.nav.timer);
					sports(active.offsetLeft, active.offsetWidth);
				};
			}
		}
	}();
	var menu_dropdown = ice('.nav .nav-dropdown');
	if (ui.nav.toggle && ui.nav.menu) {
		ui.nav.toggle.onclick = function () {
			ice.toggle(ui.nav.menu);
		}
		if (ice.isMobile()) {
			ice('a', ui.nav.menu).on('click', function () {
				ice.hide(ui.nav.menu)
			})
		}
		ui.reg('resize', function (w, h) {
			ice.delCss(ui.nav.toggle, 'open');
		})
		//下拉菜单居中
		if (ui.webW > 768) {
			if (menu_dropdown.length) {
				for (var i = 0; i < menu_dropdown.length; i++) {
					menu_dropdown[i].style.marginLeft = (menu_dropdown[i].parentNode.offsetWidth - 150) / 2 + "px";
				}
			}
		}
	}
	if (ui.nav.menu) {
		//给拥有下拉菜单的li添加标识，显示箭头
		menu_dropdown.each(function () {
			ice.addCss(this.parentNode, 'dropdown');
		});
	}

	//下拉选择框
	ui.select();

	//下拉菜单
	!function () {
		ice('.dropdown .dropdown-toggle').each(function () {
			ice.click(this, function (e) {
				var a = this.parentNode;
				if (ice.hasCss(a, 'open')) {
					ice.delCss(a, 'open');
				} else {
					ice.delCss(ice('.dropdown'), 'open');
					ice.addCss(a, 'open');
				}
				ice.on(a, 'click', function (e) {
					ice.sp(e);
				});
				ice.pd(e);
			});
			if (ice.hasCss(this, 'dropdown-hover')) {
				ice.on(this, 'mouseover', function (e) {
					ice.addCss(this.parentNode, 'open');
					ice.sp(e);
				});
				ice.on(this, 'mouseout', function (e) {
					ice.delCss(this.parentNode, 'open');
				});
				ice.on(ice(this).next(), 'mouseover', function (e) {
					ice.addCss(this.parentNode, 'open');
				});
				ice.on(ice(this).next(), 'mouseout', function (e) {
					ice.delCss(this.parentNode, 'open');
				});
			}
		})

		//点击任何区域关闭下拉菜单
		ice.on(document, 'click', function () {
			ice.delCss(ice('.dropdown'), 'open');
		});
	}();

	//表单处理以及验证
	!function(){
		var form = ice('form');
		if (form.length) {
			var notes = function(reg,el,content){
				if (!reg.test(ice(el).val())) {
					ice.notes(el,content);
					return 1;
				}
				return 0;
			};
			var fieldCheck = function(el){
				var isError = 0;
				el.find('[data-check]').each(function(){
					var type = ice(this).attr('data-check');
					if(type && !ice(this).val()){
						isError = 1;
						ice.notes(this,'不能为空');
						return false;
					}
					if(type == 'username'){
						isError = notes(/^[0-9a-zA-Z\u4e00-\u9fa5_]{1,16}$/,this,'长度为1-16字符，支持中文、大小写字母和下划线，不支持空格');
					}else if(type == 'password'){
						isError = notes(/^[\w]{6,14}$/,this,'长度为1-16字符，支持中文、大小写字母和下划线，不支持空格');
					}else if(type == 'email'){
						isError = notes(/^([\w\.\-]+)@([\w]+)\.([a-zA-Z]{2,4})$/,this,'长度为1-16字符，支持中文、大小写字母和下划线，不支持空格');
					}else if(type == 'tel'){
						isError = notes(/^[\d\-]{5,15}$/,this,'电话号码格式不正确');
					}else if(type == 'phone'){
						isError = notes(/^[\d]{11}$/,this,'手机号格式不正确');
					}else if(type == 'ID'){
						isError = notes(/^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/,this,'身份证号格式不正确');
					}else if(type == 'number'){
						isError = notes(/^\d+$/,this,'只能为纯数字');
					}else if(type == 'float'){
						isError = notes(/^\d+(.\d+)?$/,this,'格式不正确');
					}
					if(isError) return false;
				})
				return isError;
			};
			var ajax = function(f){
				var el = ice(f);
				var isAjax = el.attr('data-ajax');
				var success = el.attr('data-success');
				var error = el.attr('data-error');
				var complete = el.attr('data-complete');
				var clear = el.attr('data-clear');
				if(isAjax){
					ice.ajax(f.action,el.form(),f.method).then(res=>{
						if(res.error){
							ice.pop(res.message);
							error && window[error] && window[error](res);
						}else{
							clear && el.form(false);
							res.message && ice.pop(res.message);
							success && window[success] && window[success](res);
						}
						complete && window[complete] && window[complete](res);
					})
				}
			};
			form.each(function(_i,obj){
				if(this._setFormCheck) return;
				this._setFormCheck = 1;
				var el = ice(this);
				el.find('input[type=submit]').on('click',function(e){
					if(fieldCheck(el)) {
						ice.pd(e);
					}else{
						ajax(obj)
					}
				})
				el.find('.submit').on('click',function(e){
					if(fieldCheck(el)) {
						ice.pd(e);
					}else{
						ice(obj).attr('data-ajax') ? ajax(obj) : form[0].submit();
					}
				})
			})
		}
	}();

	//选项卡切换
	!function () {
		var tab = ice('.tab');
		if (tab.length) {
			tab.each(function (_i, el) {
				var menuBox = el.children[0],    //获取菜单容器
					contentBox = el.children[1]; //获取内容容器
				if (menuBox && contentBox) {
					var move, active = 0, isMove = 1, j = { width: 0, left: 0 },
						menu = ice('a', menuBox),        //获取所有菜单
						content = contentBox.children,  //获取所有内容
						setLine = function (obj, move) { j.width = obj[j.swh] + 'px'; j.left = obj[j.slt] + 'px'; move.style[j.wh] = j.width; move.style[j.lt] = j.left; };
					if (menu.length !== content.length) return;
					//新建移动的线-判断是否存在move的html
					if (ice('.tab-move', menuBox).length) {
						move = ice('.tab-move', menuBox)[0];
						if (ice.attr(move, 'style')) isMove = 0;
					} else {
						move = ice.c('div');
						move.className = 'tab-move';
						menuBox.prepend(move);
					}
					//创建滚动条
					if (!ice.isMobile() && menuBox.scrollWidth > menuBox.offsetWidth) {
						var scroll = ice.c('div');
						scroll.className = 'tab-scroll';
						// scroll.style.width = Math.floor(menuBox.offsetWidth / 4) + 'px';
						ice(menuBox).after(scroll);
						el.st = 0;
						scroll.onmousedown = function (e) {
							el.st = 1;
							ice(el).addCss('noselect');
							ice(scroll).addCss('tab-scroll-move');
							var pos = e;
							var xs = scroll.offsetLeft;
							var sw = scroll.offsetWidth;
							var mw = menuBox.offsetWidth;
							var msw = menuBox.scrollWidth
							document.onmousemove = function (e) {
								let x = e.x - pos.x + xs;
								if (x < 0) {
									x = 0;
								} else if (x + sw > mw) {
									x = mw - sw;
								}
								menuBox.scrollLeft = (msw - mw) / ((mw - sw) / x);
								ice(scroll).css({
									left: x + 'px',
								})
							}
							document.onmouseup = function () {
								el.st = 0;
								document.onmousemove = null;
								document.onmouseup = null;
								ice(el).delCss('noselect');
								ice(scroll).delCss('tab-scroll-move');
							}
						};
						scroll.onmouseover = function (e) {
							clearTimeout(el.st);
						};
						scroll.onmouseout = function (e) {
							if (el.st !== 1) {
								el.st = setTimeout(() => { ice(scroll).delCss('tab-scroll-show') }, 600);
							}
						};
						menuBox.onmouseover = function () {
							clearTimeout(el.st);
							ice(scroll).addCss('tab-scroll-show');
						};
						menuBox.onmouseout = function () {
							if (el.st !== 1) {
								el.st = setTimeout(() => { ice(scroll).delCss('tab-scroll-show') }, 600);
							}
						};

					}
					//判断是否为侧栏风格
					if (ice.hasCss(el, 'tab-sidebar')) {
						j.wh = 'height', j.lt = 'top', j.swh = 'offsetHeight', j.slt = 'offsetTop';
					} else {
						j.wh = 'width', j.lt = 'left', j.swh = 'offsetWidth', j.slt = 'offsetLeft';
					}
					menu.each(function (mi, m) {
						//判断是否有激活的菜单
						if (m.className == 'active') {
							if (isMove) setLine(m, move);
							content[mi].className = 'tab-content active';
							active = 1;
						}
						//菜单点击事件
						this.onclick = function (e) {
							//是否为#，不是的话当可以当a标签跳转
							if (ice.attr(this, 'href') == '#') {
								ice(menu).delCss('active');
								ice(content).delCss('active');
								ice(this).addCss('active');
								ice(content).s(mi).addCss('active');
								setLine(this, move);
								ice.sp(e);
								return false;
							}
						}
						//移动到菜单
						this.onmouseover = function () {
							move.style[j.wh] = m[j.swh] + 'px';
							move.style[j.lt] = m[j.slt] + 'px';
						}
						//移出菜单
						this.onmouseout = function () {
							move.style[j.wh] = j.width;
							move.style[j.lt] = j.left;
						}
					});
					//如果没有默认的激活菜单，则默认激活第一个菜单
					if (!active) {
						menu[0].className = 'active';
						content[0].className = 'tab-content active';
						setLine(menu[0], move);
					}
				}
				ice.addCss(el, 'tab-show');
			});
		}
	}();

	//在线客服
	!function () {
		ui.toolbar = ui.toolbar || {};
		if (ui.toolbar.qq || ui.toolbar.wx || ui.toolbar.tel || ui.toolbar.scan || ui.toolbar.top) {
			var html = '';
			if (ui.toolbar.qq || ui.toolbar.wx || ui.toolbar.tel) {
				html += '<div id="toolbar-contact">';
				html += '<i class="icon ice-custom-service"></i>';
				html += '<div id="toolbar-contact-box" ' + (ui.toolbar.contact ? 'style="display: block;"' : '') + '>';
				html += '<div class="toolbar-title"><i class="icon ice-custom-service"></i>在线客服<i id="toolbar-contact-close" class="icon ice-close-line"></i></div>';
				//微信
				if (ui.toolbar.wx) {
					//html += '<div class="toolbar-tel-title"><i class="icon ice-weixin"></i>微信客服</div>';
					html += '<ul class="toolbar-qq-list">';
					for (var i = 0, wx; wx = ui.toolbar.wx[i++];) {
						html += '<li><a data-pjax="false" href="javascript:;"><i class="icon ice-weixin"></i>' + wx + '</a></li>';
					}
					html += '</ul>';
				}
				//qq
				if (ui.toolbar.qq) {
					//html += '<div class="toolbar-tel-title"><i class="icon ice-qq"></i>QQ客服</div>';
					html += '<ul class="toolbar-qq-list">';
					for (var i = 0, qq; qq = ui.toolbar.qq[i++];) {
						html += '<li><a data-pjax="false" href="tencent://message/?uin=' + qq + '&amp;Site=uelike&amp;Menu=yes"><i class="icon ice-qq"></i>' + qq + '</a></li>';
					}
					html += '</ul>';
				}
				//手机号
				if (ui.toolbar.tel) {
					html += '<div class="toolbar-tel-title"><i class="icon ice-tel"></i>联系电话</div>';
					html += '<ul class="toolbar-tel-list">';
					for (var i = 0, tel; tel = ui.toolbar.tel[i++];) {
						html += '<li><a data-pjax="false" href="tel:' + tel + '">' + tel + '</a></li>';
					}
					html += '</ul>';
				}
				html += '</div>';
				html += '</div>';
			}
			if (ui.toolbar.scan) {
				html += '<div id="toolbar-scan">';
				html += '<i class="icon ice-erweima"></i>';
				html += '<div id="toolbar-scan-popup"><div><img src="' + ui.toolbar.scan + '" alt=""/><span>扫一扫进入手机端</span></div></div>';
				html += '</div>';
			}
			if (ui.toolbar.top) {
				html += '<div id="toolbar-top"><i class="icon ice-arrow-line-t"></i></div>';
			}
			var toolbar = ice.c('div');
			toolbar.id = 'toolbar';
			toolbar.innerHTML = html;
			ui.body.append(toolbar);
			if (ui.toolbar.qq || ui.toolbar.wx || ui.toolbar.tel) {
				toolbar.contact = ice('#toolbar-contact')[0];
				toolbar.contactBox = ice('#toolbar-contact-box')[0];
				toolbar.contactClose = ice('#toolbar-contact-close')[0];
				toolbar.contactClose.onclick = function (e) {
					ice.sp(e);
					ice.delCss(toolbar.contactBox, 'ani-right-in');
					ice.addCss(toolbar.contactBox, 'ani-right-out');
					setTimeout(function () { toolbar.contactBox.style.display = null; }, 300);
				}
				toolbar.contact.onclick = function () {
					toolbar.contactBox.style.display = "block";
					ice.delCss(toolbar.contactBox, 'ani-right-out');
					ice.addCss(toolbar.contactBox, 'ani-right-in');
				}
			}
			if (ui.toolbar.scan) {
				toolbar.scan = ice('#toolbar-scan');
				if (toolbar.scan.length) {
					toolbar.scanPopup = ice('#toolbar-scan-popup')[0];
					toolbar.scan[0].onclick = function () {
						toolbar.scanPopup.style.display = 'block';
						toolbar.scanPopup.className = 'ani-up-in';
					}
					toolbar.scanPopup.onclick = function (e) {
						ice.sp(e);
						this.className = 'ani-up-out';
						setTimeout(function () { toolbar.scanPopup.style.display = null; }, 300);
					}
				}
			}
			if (ui.toolbar.top) {
				// 获取置顶对象
				toolbar.top = ice('#toolbar-top')[0];
				//根据滚动条判断动画项是否出现在视口里面
				ui.reg('scroll', function (e) {
					if (e.y > 300) {
						toolbar.top.style.display = 'block';
						toolbar.top.className = 'ani-down-in';
					} else {
						toolbar.top.style.display = 'none';
					}
				});
				// 置顶对象点击事件
				toolbar.top.onclick = function () {
					var timer = setInterval(function () {
						window.scrollBy(0, -50);
						if (ice.scroll().y == 0) clearInterval(timer);
					}, 2);
				}
			}
		}
	}();

	//单文件上传
	ui.singleFileUpload();
	ui.singleFileDragUpload();

	//多图片上传
	!function () {
		var el = ice('.iceUpload-img');
		if (el.length) {
			el.each(function () {
				if (this.initUpload) return;
				this.initUpload = 1;
				var inputName = ice(this).attr('data-name');
				var accept = ice(this).attr('data-accept');
				var delFn = ice(this).attr('data-del');
				var successFn = ice(this).attr('data-success');
				var errorFn = ice(this).attr('data-error');
				var completeFn = ice(this).attr('data-complete');
				var uploadUrl = ice(this).attr('data-url');
				var count = +(ice(this).attr('data-count'));
			  if(/^\w+(\.|\w)+\w+$/.test(uploadUrl)) uploadUrl = window['eval'].call(window, uploadUrl);
				if (!ice('.iceUpload-list', this).length) this.innerHTML = '<div class="iceUpload-list" style="display:none;"></div>' + this.innerHTML;
				var imgList = ice('.iceUpload-list', this)[0];
				var imgSrc = [];
				var imgBtn = ice('.btn', this)[0];
				var btnInit = function(){
					if(count && ice('img', imgList).length >= count){
						ice(imgBtn).addCss('bg-gray')
					}else{
						ice(imgBtn).delCss('bg-gray')
					}
				};

				//图片回显
				var imgs = ice('img', this);
				if (imgs.length) {
					if(count)imgs = imgs.splice(0,count);
					imgs.each(function (i) {
						var html = `<div class="iceUpload-item">
									 <div class="iceUpload-order">${i + 1}</div>
									 <div class="iceUpload-info">
										 <img src="${ice(this).attr('src')}"/>
									 </div>
									 <div class="iceUpload-close">✕</div>
								 </div>`;
						ice(imgList).append(html).show();
						ice(this).del();
						btnInit();
					})
				}

				ice('.iceUpload-close', imgList).click(function () {
					var src = ice('img', this.parentNode).attr('src');
					ice.del(this.parentNode);
					imgSrc = [];
					ice('img', imgList).each(function () {
						imgSrc.push(ice(this).attr('src'));
					});
					delFn && window[delFn] && window[delFn](src, imgSrc);
					//重新排序
					var order = ice('.iceUpload-order', imgList);
					order.each(function (s) {
						this.innerHTML = s + 1;
					});
					if (!order.length) imgList.style.display = 'none';
					btnInit();
				});
				if (imgBtn) {
					imgBtn.onclick = function () {
						if (!inputName) return ice.pop('需设置name属性', 'warning');
						if (!uploadUrl) return ice.pop('需设置url上传地址属性', 'warning');
						if(count && ice('img', imgList).length === count) return ice.pop('限制上传'+count+'张图片', 'warning');
						if (input) ice.del(input), input = null;
						//创建input
						var input = ice.c('input');
						input.type = 'file';
						input.multiple = true;
						input.name = inputName;
						input.accept = accept ? accept : 'image/*';
						input.onchange = function () {
							//获取上传文件的扩展名
							var ext = input.value;
							var extIndex = ext.lastIndexOf('.');
							ext = ext.substring(extIndex + 1).toLowerCase();
							if (ext != 'jpg' && ext != 'jpeg' && ext != 'gif' && ext != 'png' && ext != 'bmp') {
								alert('仅支持上传jpg、gif、png等图片格式的文件');
								ice.del(input);
								return;
							}
							ice.each(this.files, function () {
								var item = ice.c('div');
								item.className = "iceUpload-item";
								var order = ice.c('div');
								order.className = "iceUpload-order"
								var info = ice.c('div');
								info.className = "iceUpload-info";
								var img = ice.c('img');
								var close = ice.c('div');
								close.innerHTML = '✕';
								close.className = 'iceUpload-close';
								var load = ice.c('div');
								load.className = "iceUpload-load";
								load.innerHTML = '<div class="loader-2"></div>';
								var res = new FileReader();
								res.readAsDataURL(this);
								res.onload = function (oFREvent) {
									img.src = oFREvent.target.result;
									imgList.removeAttribute('style');
								};

								//最终输出
								info.appendChild(img);
								item.appendChild(order);
								item.appendChild(info);
								item.appendChild(close);
								item.appendChild(load);
								imgList.appendChild(item);
								//获取所有图片列表
								var imgItem = ice('.iceUpload-item', imgList);
								//图片排序
								order.innerHTML = imgItem.length;
								close.onclick = function () {
									var src = ice(img).attr('src');
									ice.del(item);
									imgSrc = [];
									ice('img', imgList).each(function () {
										imgSrc.push(ice(this).attr('src'));
									});
									delFn && window[delFn] && window[delFn](src, imgSrc);
									//重新排序
									var imgOrder = ice('.iceUpload-order', imgList);
									if (imgOrder.length) {
										for (var a = 0, o; o = imgOrder[a++];) { o.innerHTML = a; }
									} else {
										imgList.style.display = 'none';
									}
									btnInit();
								}
								var formData = new FormData();
								formData.append(input.name, this);
								ice.ajax({
									url: uploadUrl,
									data: formData,
									success: function (res) {
										if (!res.error) {
											img.src = res.url;
											ice(load).hide();
											imgList.removeAttribute('style');
											imgSrc = [];
											ice('img', imgList).each(function () {
												var src = ice(this).attr('src');
												if (src.substring(0, 5) != 'data:') imgSrc.push(src); //过滤base64图片
											});
											successFn && window[successFn] && window[successFn](res, imgSrc);
										} else {
											ice(item).addCss('iceUpload-error');
											ice('.iceUpload-order', item).html(res.error);
											ice(load).hide();
											errorFn && window[errorFn] && window[errorFn](res, imgSrc);
											ice.fail(res.message);
										}
										btnInit();
										completeFn && window[completeFn] && window[completeFn](res, imgSrc);
									}
								})
							});
						}
						input.click();
						return false;
					}
				}
			});
		}
	}();

	//多附件上传
	!function () {
		var el = ice('.iceUpload-file');
		if (el.length) {
			el.each(function () {
				if (this.initUpload) return;
				this.initUpload = 1;
				var inputName = ice(this).attr('data-name');
				var accept = ice(this).attr('data-accept');
				var successFn = ice(this).attr('data-success');
				var errorFn = ice(this).attr('data-error');
				var closeFn = ice(this).attr('data-del');
				var completeFn = ice(this).attr('data-complete');
				var uploadUrl = ice(this).attr('data-url');
				var count = +(ice(this).attr('data-count'));
				var btnInit;
			  if(/^\w+(\.|\w)+\w+$/.test(uploadUrl)) uploadUrl = window['eval'].call(window, uploadUrl);
				if (!ice('.iceUpload-list', this).length) this.innerHTML = '<div class="iceUpload-list" style="display:none;"></div>' + this.innerHTML;
				var fileList = ice('.iceUpload-list', this)[0];
				var fileSrc = [];
				//附件添加
				var fileBtn = ice('.btn', this)[0];
				btnInit = function(){
					if(count && ice('.iceUpload-item', fileList).length >= count){
						ice(fileBtn).addCss('bg-gray')
					}else{
						ice(fileBtn).delCss('bg-gray')
					}
				};

				ice('.iceUpload-close', fileList).click(function () {
					var src = ice(this.parentNode).attr('data-url');
					ice.del(this.parentNode);
					fileSrc = [];
					ice('.iceUpload-item', fileList).each(function () {
						fileSrc.push(ice(this).attr('data-url'));
					});
					closeFn && window[closeFn] && window[closeFn](src, fileSrc);
					//重新排序
					var order = ice('.iceUpload-order', fileList);
					order.each(function (s) {
						this.innerHTML = s + 1;
					});
					if (!order.length) fileList.style.display = 'none';
					btnInit();
				});
				if (fileBtn) {
					fileBtn.onclick = function () {
						if (!inputName) return ice.pop('需设置name属性', 'warning');
						if (!uploadUrl) return ice.pop('需设置url上传地址属性', 'warning');
						if(count && ice('.iceUpload-item', fileList).length === count) return ice.pop('限制上传'+count+'个文件', 'warning');
						if (input) ice.del(input), input = null;
						//创建input
						var input = ice.c('input');
						input.type = 'file';
						input.multiple = true;
						input.name = inputName;
						if (accept) input.accept = accept;
						input.onchange = function () {
							ice.each(this.files, function () {
								fileList.removeAttribute('style');
								var item = ice.c('div');
								item.className = "iceUpload-item";
								var order = ice.c('div');
								order.className = "iceUpload-order";
								var info = ice.c('div');
								info.className = "iceUpload-info";
								info.innerHTML = '<span class="iceUpload-name">' + this.name + '</span><span class="iceUpload-size">' + ice.toSize(this.size) + '</span>';
								var close = ice.c('div');
								close.innerHTML = '✕';
								close.className = 'iceUpload-close';
								var load = ice.c('div');
								load.className = "iceUpload-load";
								load.innerHTML = '<div class="loader-2"></div>';

								//最终输出
								item.appendChild(order);
								item.appendChild(info);
								item.appendChild(close);
								item.appendChild(load);
								fileList.appendChild(item);
								//获取所有列表
								var fileItem = ice('.iceUpload-item', fileList);
								//排序
								order.innerHTML = fileItem.length;
								close.onclick = function () {
									var src = ice(item).attr('data-url');
									ice.del(item);
									fileSrc = [];
									ice('.iceUpload-item', fileList).each(function () {
										fileSrc.push(ice(this).attr('data-url'));
									});
									closeFn && window[closeFn] && window[closeFn](src, fileSrc);
									//重新排序
									var fileOrder = ice('.iceUpload-order', fileList);
									if (fileOrder.length) {
										for (var a = 0, o; o = fileOrder[a++];) { o.innerHTML = a; }
									} else {
										fileList.style.display = 'none';
									}
									btnInit();
								}
								var formData = new FormData();
								formData.append(input.name, this);
								ice.ajax({
									url: uploadUrl,
									data: formData,
									success: function (res) {
										if (!res.error) {
											ice(load).hide();
											ice(item).attr('data-url', res.url);
											fileList.removeAttribute('style');
											fileSrc = [];
											ice('.iceUpload-item', fileList).each(function () {
												fileSrc.push(ice(this).attr('data-url'));
											});
											successFn && window[successFn] && window[successFn](res, fileSrc);
										} else {
											ice(item).addCss('iceUpload-error');
											ice('.iceUpload-name', item).html(res.error);
											ice(load).hide();
											errorFn && window[errorFn] && window[errorFn](res, fileSrc);
											ice.fail(res.message);
										}
										btnInit();
										completeFn && window[completeFn] && window[completeFn](res, fileSrc);
									}
								})
							});
						}
						input.click();
						return false;
					}
				}
			});
		}
	}();

	//轮播
	!function () {
		var slider = ice('.slider');
		if (slider) {
			slider.each(function () {
				if (this.initSlider) return;
				this.initSlider = 1;
				var ani = ice.attr(this, 'data-slider-ani');
				var time = ice.attr(this, 'data-slider-time');
				var arrow = ice.attr(this, 'data-slider-arrow');
				arrow = arrow == 'false' ? false : true;
				var button = ice.attr(this, 'data-slider-button');
				button = button == 'false' ? false : true;
				var item = ice('.slider-item', this);
				var img = ice('img', item[0]);
				var num = item.length - 1;
				//如果没有轮播项的话，就不执行了
				if (!item.length) return;
				//默认激活第一个轮播项
				if (!item.hasCss('active')) item.s(0).addCss('active');
				//如果只有一个轮播项的话，也不用执行了，没意义！
				if (item.length == 1) return;

				// 创建箭头和指示器
				var buttons;
				if (arrow) {
					if (ice(this).hasCss('slider-prev') && ice(this).hasCss('slider-next')) {
						var prevBtn = ice('.slider-prev', this);
						var nextBtn = ice('.slider-next', this);
					} else {
						ice(this).append('<div class="slider-prev"></div><div class="slider-next"></div>');
						var prevBtn = ice('.slider-prev', this);
						var nextBtn = ice('.slider-next', this);
					}
				}
				if (button) {
					if (ice(this).hasCss('slider-button')) {
						var buttonBox = ice('.slider-button', this);
					} else {
						ice(this).append('<div class="slider-button"></div>');
						var buttonBox = ice('.slider-button', this);
					}
				}
				if (img.length) {
					//如果轮播为图片的话，图片加载完后初始化
					var pic = new Image();
					pic.src = img[0].src;
					pic.onload = function () {
						init();
					}
				} else {
					init();
				}
				//初始化
				function init() {
					time = time ? Number(time) : 3000;
					//遍历所有轮播项
					item.each(function (i) {
						//设置轮播小圆点
						if (button) {
							let html = i > 0 ? '<span></span>' : '<span class="active"></span>';
							buttonBox.append(html);
						}
						//移动端滑动
						var startX = 0, moveX = 0;
						this.addEventListener('touchstart', function (e) {
							// 如果这个元素的位置内只有一个手指的话 
							if (e.targetTouches.length == 1) {
								startX = e.targetTouches[0].pageX;
							}
						}, false);
						this.addEventListener('touchmove', function (e) {
							// 如果这个元素的位置内只有一个手指的话 
							if (e.targetTouches.length == 1) {
								moveX = startX - e.targetTouches[0].pageX;
							}
						}, false);
						this.addEventListener('touchend', function (e) {
							if (moveX > 50) { //下一张
								play();
							} else if (moveX < -50) {
								var s = !index ? num - 1 : (index === 1 ? num : index - 2);
								play(s);
							}
							startX = 0;
							moveX = 0;
						}, false);
					});
					//轮播运行
					var run;
					function setPlay() {
						run = setInterval(function () {
							play();
						}, time);
					}
					setPlay();

					//给小圆点添加事件
					if (button) {
						buttons = ice('span', buttonBox);
						buttons.click(function (a) {
							if (this.className != 'active') {
								play(a);
							}
						});
						buttonBox.on('mouseover', function () {
							clearInterval(run)
						});
						buttonBox.on('mouseout', function () {
							setPlay();
						});
					}

					//给按钮添加事件
					if (arrow) {
						if (ice.isMobile()) {
							prevBtn.on('touchend', function () {
								var s = !index ? num - 1 : (index === 1 ? num : index - 2);
								play(s);
							});
						} else {
							prevBtn.on('mouseover', function () {
								clearInterval(run)
							});
							prevBtn.on('mouseout', function () {
								setPlay();
							});
							prevBtn.click(function () {
								var s = !index ? num - 1 : (index === 1 ? num : index - 2);
								play(s);
							});
						}
						if (ice.isMobile()) {
							prevBtn.on('touchend', function () {
								play();
							});
						} else {
							nextBtn.on('mouseover', function () {
								clearInterval(run)
							});
							nextBtn.on('mouseout', function () {
								setPlay();
							});
							nextBtn.click(function () {
								play();
							});
						}
					}
				}
				//轮播
				var index = 1;   //轮播的当前索引
				var prev = 0;    //轮播的上一张索引
				var isClick = 0; //是否已点击
				var next = 1;    //播放动画是否为下一张
				//动画类型
				var key = {
					lr: { 0: 'left', 1: 'right' },
					ud: { 0: 'down', 1: 'up' },
					fade: { 0: 'fade', 1: 'fade' },
				}
				ani = ani ? ani : 'lr';
				ani = key[ani] ? ani : 'lr';
				var css = {
					prev: {
						0: 'next slider-' + key[ani][1] + '-out',
						1: 'active slider-' + key[ani][0] + '-in',
						2: 'active next slider-' + key[ani][1] + '-out',
						3: 'slider-' + key[ani][0] + '-in',
					},
					next: {
						0: 'next slider-' + key[ani][0] + '-out',
						1: 'active slider-' + key[ani][1] + '-in',
						2: 'active next slider-' + key[ani][0] + '-out',
						3: 'slider-' + key[ani][1] + '-in',
					}
				}
				function play(s) {
					//动画未执行完，防止重复点击
					if (isClick) return;
					isClick = 1;
					next = 1;
					index = s == undefined ? index : s;
					if (s != undefined) {
						index = s;
						if (index < prev) next = 0;
					}


					//动画方式
					var type = next ? 'next' : 'prev';
					//动画效果
					+function (a, b) {
						ice.addCss(item[a], css[type][0]);
						ice.addCss(item[b], css[type][1]);
						setTimeout(function () {
							ice.delCss(item[a], css[type][2]);
							ice.delCss(item[b], css[type][3]);
							prev = b;
							isClick = 0;
						}, 590);
					}(prev, index);
					//小圆点高亮
					if (button) {
						buttons.each(function (i) {
							this.className = index == i ? 'active' : '';
						});
					}
					index++;
					index = index > num ? 0 : index;
				}
			});
		}
	}();

	//运行扩展
	ui.expand && ui.expand();

	ice.eachNode(window.document, function () {
		for (var i = 0; i < ui.event['node'].length; i++) {
			ui.event['node'][i](this);
		}
	})
};
//初始化ui框架的前端页面
ice.ready(function () {
	ui.init();
});