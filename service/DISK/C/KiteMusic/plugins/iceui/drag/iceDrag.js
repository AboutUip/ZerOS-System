'use strict';
/**
 ************************************************************************
 * ice.drag(拖动排序插件)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-07-02
 * 更新：2023-07-15
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */

/**
 * options   {json}
 *  ├ el      {object} 需要拖拽的列表父级对象
 *  └ target  {object} 自定义指定目标的点击对象
 *------------------------------------------------------------------------------------*
 */
var ice = ice || {};
ice.drag = function(options) {
	var node = ice(options.el);
	if (!node.length) return;
	// 设置动画
	function setAni(prevRect, target) {
		var targetEl = ice(target);
		var currentRect = target.getBoundingClientRect();
		if (prevRect.nodeType === 1) prevRect = prevRect.getBoundingClientRect();
		targetEl.style('transition', 'none');
		targetEl.style('transform', `translate3d(${prevRect.left - currentRect.left}px, ${prevRect.top - currentRect.top}px, 0)`);
		target.offsetWidth; // 触发重绘
		targetEl.style('transition', 'all .2s');
		targetEl.style('transform', 'translate3d(0,0,0)');
		clearTimeout(target.animated);
		target.animated = setTimeout(function () {
			targetEl.style('transition', '');
			targetEl.style('transform', '');
			target.animated = false;
		}, 200);
	}
	// 获取父节点
	function parentNode(parent, el) {
		for (var i = 0; i < parent.length; i++) {
			if (parent[i].contains(el)) {
				return parent[i];
			}
		}
	}
	node.each(function () {
		ice(this).children().each(function () {
			var that = this;
			if (options.target) {
				ice(options.target, this).each(function () {
					this.onmousedown = function () {
						that.draggable = true;
					}
				})
			} else {
				this.onmousedown = function () {
					that.draggable = true;
				}
			}
		})
		var draging;
		//拖拽开始
		this.ondragstart = function (e) {
			e.dataTransfer.effectAllowed = 'move';
			draging = e.target;
		}
		//拖拽进入目标
		this.ondragenter = function (e) {
			e.preventDefault();
			var target = e.target;
			//判断是否包含拖动元素
			if (this.contains(target)) {
				target = parentNode(this.children, target);
				if (target !== draging) {
					if (!target || target.animated) return;
					//获取元素相对于视窗的位置
					var targetRect = target.getBoundingClientRect();
					var dragingRect = draging.getBoundingClientRect();
					target.parentNode.insertBefore(draging, ice(draging).index() < ice(target).index() ? target.nextSibling : target);
					setAni(dragingRect, draging);
					setAni(targetRect, target);
				}
			}
		}
		//拖拽移动中
		this.ondragover = function (e) {
			e.preventDefault()
		}
		//拖拽结束
		this.ondragend = function () {
			ice(this).children().each(function () {
				ice(this).delAttr('draggable')
			})
		}
	})
};