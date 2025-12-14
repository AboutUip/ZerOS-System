'use strict';
/**
 ************************************************************************
 * ice.tree(树形菜单)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-07-02
 * 更新：2022-04-27
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */

var ice = ice || {};
ice.tree = function(options) {
	options = options || {};
	var el = options.el || '#tree'; //默认容器的id
	var json = options.json || 0; //传入的json数据，默认为空
	var id = options.id || 'id'; //json菜单的id，默认为id
	var pid = options.pid || 'pid'; //json菜单的pid，默认为pid
	var name = options.name || 'name'; //json菜单的name，默认为name
	var url = options.url || 'url'; //json菜单的url，默认为url
	var target = options.target || 0; //新窗口打开，默认为本窗口打开
	var allTarget = options.allTarget || 0; //全局新窗口打开，默认为本窗口打开
	var spread = options.spread || 0; //菜单展开，默认不展开全部菜单
	var closeAll = options.closeAll || 0; //展开当前选中菜单，关闭其它已展开的菜单
	var trigger = options.trigger || 'click'; //触发方式，默认为鼠标点击展开菜单
	var time = options.time || 2; //展开收缩动画速度，单位毫秒
	var callback = options.callback || false; //回调函数，展开收缩动画之后执行该函数
	if (json) {
		//判断json的数据是否为字符串
		if (Object.prototype.toString.call(json) === '[object String]') {
			var list = eval('(' + json + ')');
		} else {
			var list = json;
		}

		//格式化数据，如果pid等于id，将pid的数据存入父级id的children中
		var data = new Array;
		for (var k in list) {
			data[list[k][id]] = list[k];
			data[list[k][id]].children = [];
		}
		for (var k in data) {
			if (data[k][pid] != 0) {
				data[data[k][pid]].children[k] = data[k];
			}
		}

		var num = 0;
		//无限递归函数，将所有的children取出来
		var listdata = function(json) {
			var html = '';
			while (true) {
				if (json.length > 0) {
					html += '<ul>';
					for (var k in json) {
						data[json[k][id]].order = num++; //给菜单添加序号
						target = allTarget ? '_blank' : (target ? json[k][target] : '_self');
						html += '<li><i class="iceui"></i><a href="' + json[k][url] + '" target="' + target + '">' + json[k][name] + '</a>';
						if (json[k].children.length > 0) {
							html += listdata(json[k].children);
						}
					}
					html += '</ul>';
					break;
				} else {
					break;
				}
			}
			return html;
		}

		//最终输出html格式数据
		var html = '';
		html += '<ul class="tree">';
		for (var k in data) {
			if (data[k][pid] == 0) {
				data[k].order = num++; //给菜单添加序号
				target = allTarget ? '_blank' : (target ? data[k][target] : '_self');
				html += '<li><i class="iceui"></i><a href="' + data[k][url] + '" target="' + target + '">' + data[k][name] + '</a>';
				html += listdata(data[k].children);
				html += '</li>';
			}
		}
		html += '</ul>';
		ice(el).html(html);
	}

	function open(e){
		if(closeAll){
			var obj = ice('.tree-open',e.parentNode.parentNode);
			ice.slideUp(ice('ul',obj), time);
			obj.delCss('tree-open');
			obj.addCss('tree-close');
		}

		ice(e.ul).delCss('tree-close');
		ice(e.parentNode).delCss('tree-close');
		ice(e.ul).addCss('tree-open');
		ice(e.parentNode).addCss('tree-open');
	}
	function close(e){
		ice(e.ul).delCss('tree-open');
		ice(e.parentNode).delCss('tree-open');
		ice(e.ul).addCss('tree-close');
		ice(e.parentNode).addCss('tree-close');
	}

	//将html数据二次处理，并添加样式和点击事件
	ice(el+' a').each(function(){
		var ul = this.parentNode.getElementsByTagName('ul');
		if (ul.length) {
			ul = ul[0];
			this.ul = ul;
			ul.style.display = spread ? 'block' : 'none';
			if (ice.hasCss(this, 'open')) {
				ul.style.display = 'block';
				open(this);
			} else if (ice.hasCss(this, 'close')) {
				ul.style.display = 'none';
				close(this);
			} else {
				if (spread) {
					ul.style.display = 'block';
					open(this);
				} else {
					ul.style.display = 'none';
					close(this);
				}
			}

			
			//给拥有下级菜单的菜单添加点击弹出事件
			if (trigger == 'click') {
				this.onclick = function() {
					ice.pd();
					if (callback) {
						callback(this);
					}
					if (this.ul.style.display == 'none') {
						ice.slideDown(this.ul, time);
						open(this);
					} else {
						ice.slideUp(this.ul, time);
						close(this);
					}
					return false;
				}
			} else if (trigger == 'hover') {
				this.onmouseover = function() {
					ice.pd();
					ice.slideDown(this.ul, time);
					open(this);
					return false;
				}
				this.onmouseout = function() {
					ice.slideUp(this.ul, time);
					close(this);
					return false;
				}
			} else {
				console.error('tree.js : trigger调用错误，只能为click或hover，默认为click');
			}
		}else{
			ice(this.parentNode).addCss('tree-alone');
		}
	});
};