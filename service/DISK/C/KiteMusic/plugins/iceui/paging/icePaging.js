'use strict';
/**
 ************************************************************************
 * ice.paging(分页)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2022-04-21
 * 更新：2022-04-27
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */

/**
 * 分页
 * @param {object} obj
 *   id: 分页id,
 *   count: 总条数,
 *   size: 每页显示几条,
 *   page: 当前页,
 *   callback(pageNum): 点击分页回调函数，返回pageNum页码
 */
var ice = ice || {};
ice.paging = function (obj) {
	class icePaging {
		constructor(obj) {
			this.pages(obj);
        }
        pages(obj) {
        	var _this = this;
            obj.callback = obj.callback || function () { };
            if (obj.count > obj.size) {
                var quantity = Math.ceil(obj.count / obj.size);

                //创建a文档碎片
                var cf = document.createDocumentFragment();
                //创建a标签
                var ca = function (name, text, num, fn) {
                    let a = document.createElement('a');
                    a.href = obj.url && num !== undefined ? obj.url.replace(/\{page\}/g,num) : '#';
                    a.className = 'paging-' + name;
                    a.innerHTML = text;
                    if(!obj.url || num == undefined){
                    	a.onclick = function () {
	                    	window.event ? window.event.cancelBubble = true : event.stopPropagation();
	                        fn && fn();
	                        return false;
	                    }
                    }
                    
                    return a;
                };
                var openPage = function(num){
                	obj.page = num;
                	_this.pages(obj);
                	obj.callback(num);
                };

                //首页
                if (obj.page == 1) {
                    cf.appendChild(ca('prev', '上一页'));
                    cf.appendChild(ca('active', '1'));
                } else {
                    cf.appendChild(ca('prev', '上一页', obj.page - 1, function () {
                        openPage(obj.page - 1);
                    }));
                    cf.appendChild(ca('num', '1', 1, function () {
                        openPage(1);
                    }));
                }

                //中间部分
                var quantityMax = quantity - 1;
                var pageMax = obj.page + 1;
                var start = (quantity <= 7 || obj.page <= 3) ? 2 : (pageMax < quantityMax) ? (obj.page - 1) : (pageMax == quantityMax ? (obj.page - 2) : (quantity - 4));
                var end = quantity <= 7 ? quantityMax : (obj.page <= 3) ? 5 : (pageMax >= quantityMax ? quantityMax : pageMax);
                if (quantity > 7 && obj.page > 3) {
                    cf.appendChild(ca('el', '…', obj.page - 2, function () {
                        openPage(obj.page - 2);
                    }));
                }
                for (var i = start; i <= end; ++i) {
                    if (i == obj.page) {
                        cf.appendChild(ca('active', i));
                    } else {
                        !function (a) {
                            (cf.appendChild(ca('num', a, a, function () {
                                openPage(a);
                            })))
                        }(i);
                    }
                }
                if (quantity > 7 && pageMax < quantityMax) {
                    cf.appendChild(ca('el', '…', end + 1, function () {
                        openPage(end + 1);
                    }));
                }
                //尾页
                if (quantity == obj.page) {
                    cf.appendChild(ca('active', quantity));
                    cf.appendChild(ca('next', '下一页'));
                } else {
                    cf.appendChild(ca('num', quantity, quantity, function () {
                        openPage(quantity);
                    }));
                    cf.appendChild(ca('next', '下一页', obj.page + 1, function () {
                        openPage(obj.page + 1);
                    }));
                }
                var paging = document.getElementById(obj.id);
                paging.innerHTML = '';
                paging.appendChild(cf);
                obj.success && obj.success(obj.page);
            }
        }
	};
	return new icePaging(obj);
};