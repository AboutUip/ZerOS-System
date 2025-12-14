'use strict';
/**
 * ice.table(数据表格)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2020-11-25
 * 更新：2023-03-24
 * MIT License By iceui.cn
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 */

var ice = ice || {};
ice.table = function (json){
    class iceTable {
        //构造函数
        constructor(json) {
			this.init(json);
			return this;
		}
		init(json){
			var json = json || {};
			var that = this;
			var table = ice('#'+json.id);
			if(!table.length) return;

			var tables = table[0].cloneNode(true);
			var tableMain,tableBox;
			if(ice(table[0].parentNode).hasCss('iceTable-box')){
				tableBox = table[0].parentNode;
				tableMain = tableBox.parentNode;
			}else{

				//干掉table，重新创建，后续用来做数据绑定
				tableMain = ice.c('div');
				tableMain.className = 'iceTable';

				tableBox = ice.c('div');
				tableBox.className = 'iceTable-box';

				tableBox.appendChild(tables);
				tableMain.appendChild(tableBox);
				table[0].parentNode.replaceChild(tableMain,table[0]);
				table = ice(tables);
			}
			this.tableMain = tableMain;
			this.tableBox = tableBox;
			this.table = table[0];
            this.data = json.data ? json.data : false;
            this.param = json.param ? json.param : false;
            this.parseData = json.parseData ? json.parseData : {
            	error: 'error',
            	count: 'count',
            	hidden: 'hidden',
            	list: 'list',
            	message: 'message',
            };

			//当前页
			this.page = json.page || 1;
			//是否为编辑模式
			this.edit = json.edit == true;

			//请求的链接地址
		    this.url = table.attr('data-url');
		    this.url = json.url?json.url:this.url;
		    if(!this.url && !this.data) return console.log('iceTable：url或data必须设置');
		    //ajax的type
		    var type = table.attr('data-type') || json.type || 'post';
		    //每页显示的条数
		    var size = +(table.attr('data-size')) || json.size || 10;
		    this.size = size;
		    //是否显示分页
		    var showPage = table.attr('data-paging') != 'false';
			showPage = json.paging !== undefined ? json.paging : showPage;
		    //是否高亮显示选中行
		    var highlight = table.attr('data-highlight') != 'false';
		    //点击某行的回调
		    var click = table.attr('data-click');
			//用于保存排序配置
			this.sorts = [];
            //定义请求数据
            var data = {};
			this.radio = [];
		    this.checkbox = [];
			//获取表格的thead
			var thead = table.find('thead');
			if (!thead.length) {
				thead = ice.c('thead');
				table.append(thead);
				thead = ice(thead);
			}
			if(json.theadShow){
				thead.delCss('none');
			}else{
				thead.addCss('none');
			}
			var html = '';
			var obj, th, field, type, tr;
			var isRadio,isCheckbox;

			//序列化表头
			if(!json.thead){
				json.thead = [];
				thead.find('th').each(function(){
					var name = ice(this)[0].innerHTML.trim();
					var template = false;
					if(/<template>([\s\S]*?)<\/template>/.test(name)){
						template = RegExp.$1.trim();
					}
					name = name.replace(/<template>([\s\S]*?)<\/template>/g,'').trim();
					var width = ice(this).attr('data-width');
					if(width){
						if(/^\d+$/.test(width)) width = +(width);
					}
					var nowrap = ice(this).attr('data-nowrap');
					if(nowrap){
						nowrap = nowrap=='true'?true:false;
					}else{
						nowrap = true;
					}
					var align = ice(this).attr('data-align');
					align = align ? align : false;
					json.thead.push({
						name: name,
						nowrap: nowrap,
						align:align,
						style:ice(this).attr('data-field'),
						class:ice(this).attr('data-class'),
						field: ice(this).attr('data-field'),
						type: ice(this).attr('data-type'),
						width: width,
						sorts: ice(this).attr('data-sorts'),
						fixed: ice(this).attr('data-fixed') === 'true' ? 1 : 0,
						el: ice(this).attr('data-el') === 'true' ? 1 : 0,
						template: template
					})
				})
				thead[0].innerHTML = '';
			}

			that.thead = json.thead;
			var theadList = ice.cloneObj(json.thead);

			//处理隐藏列
			if(json.hidden){
				var hide = json.hidden && typeof json.hidden === 'string' ? json.hidden.trim().split(',') : false;
				if(hide){
					for(var i=0;i<theadList.length;i++){
						if(hide.includes(theadList[i].field)){
							theadList.splice(i,1);
							i--;
						}
					}
				}
			}

			//先格式化thead
			html = '<tr>';
			var fixedLeft=0,_fixedLeft=0,fixedStatus=0,fixedRight=0,_fixedRight=0,theadShow=0;
			for(var i=0;i<theadList.length;i++){
				if(theadList[i].name != undefined){
					theadShow = 1;
				}
				if(theadList[i].sorts){
					that.sorts[theadList[i].field] = that.sorts[theadList[i].field] || false;
				}
				var css = '',style=[],content = theadList[i].name != undefined ? theadList[i].name : '';
				if(theadList[i].type == 'radio'){
					isRadio = true;
					if(theadList[i].field)that.radioName = theadList[i].field;
					content = '<div class="table-radio"></div>';
					theadList[i].width = theadList[i].width || 54;
				}else if(theadList[i].type == 'checkbox'){
					isCheckbox = true;
					if(theadList[i].field)that.checkboxName = theadList[i].field;
					content = '<div class="table-checkbox"></div>';
					theadList[i].width = theadList[i].width || 54;
				}
				if(theadList[i].nowrap || theadList[i].nowrap == undefined){
					style.push('white-space:nowrap');
				}
				if(theadList[i].align){
					style.push('text-align:'+theadList[i].align);
					if(theadList[i].align == 'center'){
						style.push('justify-content:center');
					}
				}
				//处理悬浮列
				if(theadList[i].fixed){
					that.fixed = true;
					if(!theadList[i].width){
						theadList[i].width = 200;
					}
					if(!i || fixedStatus === 1){
						that.fixedLeft = 1;
						theadList[i].fixedLeft = i ? (fixedLeft-1) : fixedLeft;
						style.push('left:'+theadList[i].fixedLeft+'px');
						fixedLeft += parseFloat(theadList[i].width);
						fixedStatus = 1;
						if(theadList[i+1] && !theadList[i+1].fixed){
							theadList[i].fixedLefts = 1;
							css = ' class="table-fixed table-fixed-left table-fixed-lefts"';
						}else{
							css = ' class="table-fixed table-fixed-left"';
						}
					}else{
						that.fixedRight = 1;
						fixedRight += parseFloat(theadList[i].width);
						var fr = 0;
						if(theadList[i+1] && theadList[i+1].fixed){
							for(var j=i+1;j<theadList.length;j++){
								fr += parseFloat(theadList[j].width);
							}
						}
						theadList[i].fixedRight = i!==theadList.length-1 ? (fr-1) : fr;
						style.push('right:'+fr+'px');
						if(theadList[i-1] && !theadList[i-1].fixed){
							theadList[i].fixedRights = 1;
							css = ' class="table-fixed table-fixed-right table-fixed-rights"';
						}else{
							css = ' class="table-fixed table-fixed-right"';
						}
					}
					
				}else{
					if(fixedStatus === 1){
						style.push('<fixedLeft>');
						fixedStatus = 2;
						_fixedLeft = i;
					}
					if(theadList[i+1] && theadList[i+1].fixed){
						style.push('<fixedRight>');
						_fixedRight = i;
					}
				}
				if(theadList[i].width){
					style.push('width:'+theadList[i].width+(typeof theadList[i].width == 'number'?'px':''));
				}
				if(style.length){
					style = ' style="'+style.join(';')+'"';
				}
				html += '<th'+css+style+'>'+content+'</th>';
			}
			if(theadShow){
				thead.delCss('none');
			}else{
				thead.addCss('none');
			}
			html += '</tr>';
			html = html.replace('<fixedLeft>','padding-left:'+(fixedLeft+10)+'px').replace('<fixedRight>','padding-right:'+(fixedRight+10)+'px');
			thead.html(html);

			//获取表格的tbody
			var tbody = table.find('tbody');
			if (!tbody.length) {
				tbody = ice.c('tbody');
				table.append(tbody);
				tbody = ice(tbody);
			}
			tbody.html(`<tr><td colspan="${theadList.length}"><div class="iceTable-loading"><div class="loader loader-7"></div></div></td></tr>`);

	    	this.getData = function (page,isLastPage,callback){
	    		this.tr = [];
	    		this.page = page;
	    		data.size = size;
	    		data.page = page;
	    		Object.assign(data,that.param);
	    		//条件查询
	    		if(!that.data){
		            ice('form').each(function(){
		            	if(ice(this).attr('data-table') == json.id){
		            		var form = this;
		            		ice('[type=submit]',this).click(function(){
			    				ice.pd();
			    				data = {};
			    				data.size = size;
			    				data.page = page;
			    				var formData = new FormData(form);
			            		formData.forEach((v,k)=>{
			            			//针对复选
			            			if(data[k]){
			            				if(typeof data[k] != 'object'){
			            					data[k] = [data[k]];
			            				}
			            				data[k].push(v);
			            			}else{
			            				data[k] = v;
			            			}
			            		})
			            		Object.assign(data,that.param);
			            		that.getData(1,0,json.form ? json.form : false);
			            		return false;
			    			})
		            	}
		            });
            	}else{
            		table.delCss('iceTable-height');
            	}


            	this.dataInit = function(res){
					ice('.paging',tableMain).html('');
					ice(tableMain).find('.table-shadow-left').del();
					ice(tableMain).find('.table-shadow-right').del();
					that.radio = [];
					that.checkbox = [];

					//如果该数据为数据列表，那么直接渲染
					var count = -1;
					if(Array.isArray(res)){
						this.list = res;
						count = res.length;
					}else{
						var parmError = eval('res.'+this.parseData.error);
						var parmCount = eval('res.'+this.parseData.count);
						var parmHidden = eval('res.'+this.parseData.hidden);
						var parmList = eval('res.'+this.parseData.list);
						var parmMessage = eval('res.'+this.parseData.message);
						var data = {
							error: parmError,
							count: parmCount ? parmCount : -1,
							hidden: parmHidden,
							list: parmList ? parmList : [],
							message: parmMessage != undefined ? parmMessage : '暂无数据'
						};
						this.list = data.list;
						json.hidden = parmHidden;
						count = data.count;
					}
			        this.count = count;
			        this.res = res;
					//render时如何当前页无数据，则跳转到有数据的页上
					if(isLastPage){
						if(this.count <= (this.page-1) * this.size){
							this.page = Math.ceil(this.count / this.size);
							that.getData(this.page);
						}
					}
			        this.checkboxName,this.radioName;

					var list = this.list;
					var num = (page - 1) * size + 1;

			        if(data && data.error){
            			tbody.html(`<tr><td colspan="${theadList.length}"><div class="iceTable-empty">${data.message}</div></td></tr>`);
						//成功回调
						json.success && json.success.call(that,that);
			            return;
            		}
			        if (count === 0 || !list.length) {
			            tbody.html(`<tr><td colspan="${theadList.length}"><div class="iceTable-empty">暂无数据</div></td></tr>`);
						//成功回调
						json.success && json.success.call(that,that);
			            return;
			        }

			        //处理排序
			        var clickSort = null;
					var sortsInit = false;
					var setTr = false;
			        ice('th',thead).each(function(i){
			        	if(theadList[i].sorts){
			        		ice(this).addCss('table-sort');
			        		this.innerHTML += '<span class="table-sort-arrow"></span>';
			            	this.i = i;
			            	this.onclick = function(){
			            		_sorts.call(this,true);
			            	};
							function _sorts(auto){
			            		var rows = that.tr;
			            		var col = this.i;
			            		var sortNum = true;
			            		if(col != clickSort){
			            			clickSort = col;
			            			ice('th',thead).delCss('table-sort-asc').delCss('table-sort-desc');
			            		}
			            		var thObj = ice(this);

								if(!that.sorts[theadList[col].field] || auto){
									thObj.toggleCss('table-sort-asc','table-sort-desc',function(){
										that.sorts[theadList[col].field] = 'asc';
									},function(){
										that.sorts[theadList[col].field] = 'desc';
									});
								}else{
									thObj.addCss('table-sort-'+that.sorts[theadList[col].field]);
								}
			            		
					            for (var i = 0; i < rows.length && sortNum; i++) {
					                sortNum = /^\d+(\.\d+)?$/.test(rows[i].cells[col].innerHTML);
					            }
					            rows.sort(function (row1,row2){
					                var result;
					                var value1, value2;
					                value1 = row1.cells[col].innerHTML;
					                value2 = row2.cells[col].innerHTML;
					                if (value1 == value2) return 0;
					                result = sortNum ? parseFloat(value1) > parseFloat(value2) : value1 > value2;
					                return result ? 1 : -1;
					            })
					            if(thObj.hasCss('table-sort-desc')) rows.reverse();
					            var frag = ice.cf();
					            ice.each(rows,function(i){
									ice(this).find('.table-order').html((that.page-1)*that.size+i+1);
					                frag.appendChild(this);
					            });
					            tbody[0].appendChild(frag);
								if(that.list.length && setTr){
									setTr();
								}
			            	};
							if(that.sorts[theadList[i].field]){
								sortsInit = ()=>{
									_sorts.call(this);
								};
							}
			        	}
			        })
					
					//处理单选框
		            if(isRadio){
		            	that.theadRadio = ice('.table-radio',thead);
	            		that.theadRadio.click(function(){
							if(that.theadRadio.hasCss('active') || !list.length) return;
							ice(this).addCss('active');
							that.radio[0].checked = true;
							ice(that.radio[0].el).addCss('active');
	            			json.radio && json.radio.call(that,that.getRadio());
		            	})
		            }

			        //处理复选框
		            if(isCheckbox){
		            	that.theadCheckbox = ice('.table-checkbox',thead);
	            		that.theadCheckbox.click(function(){
							if(!list.length) return;
	            			if(ice(this).hasCss('active')){
	            				that.deselect()
	            				ice(this).delCss('active')
	            			}else{
	            				that.checkall()
	            				ice(this).addCss('active')
	            			}
	            			json.checkbox && json.checkbox.call(that,that.getCheckbox());
		            	})
		            }

		        	//再格式化tbody
		        	//创建tr文档碎片
				    var trCF = ice.cf();
			        for (var i = 0;i<list.length;i++) {
			            obj = list[i];
			            html = '';
						//创建tr标签
						tr = ice.c('tr');
			            for (var j = 0; j < theadList.length; j++) {
			                th = theadList[j];
							th.tr = tr;
							//创建td标签
							th.td = ice.c('td');
							var css = [],style = [],content='';
			        		if(th.width || th.el){
								th.width = th.width ? th.width : 200;
			        			style.push('width:'+th.width+(typeof th.width == 'number'?'px':''));
			        		}
			        		if(th.nowrap || th.nowrap == undefined){
								if(th.width){
									style.push('word-break:break-all');
								}else{
									style.push('white-space:nowrap');
								}
			        		}
			        		if(th.align){
			        			style.push('text-align:'+th.align);
								if(th.align == 'center'){
									style.push('justify-content:center');
								}
			        		}
			        		if((th.type == 'radio' || th.type == 'checkbox') && !th.width) {
			        			style.push('width:54px');
			        		}
							//处理悬浮列
							if(this.list.length){
								if(th.fixed){
									if(th.fixedLeft !== undefined){
										if(j) style.push('left:'+th.fixedLeft+'px');
										if(th.fixedLefts){
											css.push('table-fixed table-fixed-left table-fixed-lefts');
										}else{
											css.push('table-fixed table-fixed-left');
										}
									}else{
										if(j!==theadList.length-1) style.push('right:'+th.fixedRight+'px');
										if(th.fixedRights){
											css.push('table-fixed table-fixed-right table-fixed-rights');
										}else{
											css.push('table-fixed table-fixed-right');
										}
									}
								}
								if(j){
									if(j === _fixedLeft) style.push('padding-left:'+(fixedLeft+10)+'px');
									if(j === _fixedRight) style.push('padding-right:'+(fixedRight+10)+'px');
								}
							}
			                //正则模板数据
			                if(th.template){
			                	content = th.template;
								if(typeof content == 'string'){
									content = content.replace(/\{%([\s\S]*?)%\}/g, function(a, b){
										b = b.trim();
										if (b.length) {
											return that.reviseEnv(b,obj,i,list);
										}
										return a;
									});
									content = content.replace(/\{(.*?)\}/g, function(a, b){
										b = b.trim();
										if (b.length) {
											return that.reviseEnv(b,obj,i,list);
										}
										return a;
									});
								}else{
									content = content.call(obj,obj,i,list,th,that);
								}
								if(th.el){
									content = '<div class="iceTable-el">'+content+'</div>';
								}else if(th.width){
									content = '<div style="width:inherit;">'+content+'</div>';
								}
			                }else{

			                	field = th.field
			                	type = th.type;
			                    if(type == 'order') {
			                        content = num + i;
									css.push('table-order');
									style.push('text-align:center');
			                    } else if(type == 'radio') {
									that.radioName = field ? field : false;
			                    	var check = that.radioName && obj[that.radioName] ? ' active' : '';
									check = th.disabled && obj[th.disabled] ? check + ' disabled' : check;
			                        content = '<div class="table-radio'+check+'"></div>';
			                    } else if(type == 'checkbox') {
									that.checkboxName = field ? field : false;
			                    	var check = that.checkboxName && obj[that.checkboxName] ? ' active' : '';
									check = th.disabled && obj[th.disabled] ? check + ' disabled' : check;
			                        content = '<div class="table-checkbox'+check+'"></div>';
			                    } else if(field) {
									content = eval('obj.'+field);
									if(th.el){
										content = '<div class="iceTable-el">'+content+'</div>';
									}else if(th.width){
										content = '<div style="width:inherit;">'+content+'</div>';
									}
			                    }
			                }
							css = css.concat(th.class?th.class.split(' '):[]);
							style = style.concat(th.style?th.style.split(';'):[]);
							if(css.length) th.td.className = css.join(' ');
							if(style.length) th.td.setAttribute('style',style.join(';'));
							th.td.innerHTML = content;
							tr.appendChild(th.td);
			            }
			            //定义返回值
			            var returnValue = {
            				index:i,
            				data:obj,
            				list:list,
            				res:res
            			};
		                
			            //cr 点击事件监听
			            !function(r){
			            	ice(tr).on('click',function(){
		                		if(highlight){
				            		ice(that.tr).delCss('active');
				            		ice(this).addCss('active');
				            	}
				            	if(click){
				            		r.tr = this;
				            		window[click] && window[click].call(that,r);
				            	}
		                	})
			            }(returnValue);

			            // tr.innerHTML = html;

			            //遍历用户自定义点击事件
			            ice.each(ice(tr).childrens(),function(e,z){
			            	var click = ice(this).attr('data-click');
			            	if(click){
			            		!function(r,tr){
			            			z.onclick=function(){
				            			ice.sp();
				            			r.tr = tr;
				            			window[click] && window[click].call(that,r);
			            			}
			            		}(returnValue,tr);
			            	}
			            })

						//遍历单选框
			            if(isRadio){
			            	!function(a){
			            		let radio = ice('.table-radio',tr);
								that.radio.push({
									index:i,
									data:obj,
									el:radio,
									checked: that.radioName ? list[i][that.radioName] : false,
									tr:tr
								});
				            	radio.click(function(){
									if(ice(this).hasCss('disabled')){
										return;
									}
									ice.each(that.radio,function(){
										this.checked = false;
										ice(this.el).delCss('active')
									})
									ice.each(list,function(s){
										list[s][that.radioName] = false;
									})
									ice(this).addCss('active');
									list[a][that.radioName] = true;
									that.radio[a].checked = ice(this).hasCss('active');
									if(that.radioName){
			            				list[a][that.radioName] = that.radio[a].checked;
			            			}
									that.theadRadioInit();
			            			json.radio && json.radio.call(that,that.getRadio());	
				            	})
			            	}(i);
			            }

			            //遍历复选框
			            if(isCheckbox){
			            	!function(a){
			            		let checkbox = ice('.table-checkbox',tr);
								that.checkbox.push({
									index:i,
									data:obj,
									el:checkbox,
									checked: that.checkboxName ? list[i][that.checkboxName] : false,
									tr:tr
								});
				            	checkbox.click(function(){
									if(ice(this).hasCss('disabled')){
										return;
									}
									ice(this).toggleCss('active');
									that.checkbox[a].checked = ice(this).hasCss('active');
			            			if(that.checkboxName){
			            				list[a][that.checkboxName] = that.checkbox[a].checked;
			            			}
									that.theadCheckboxInit();
			            			json.checkbox && json.checkbox.call(that,that.checkbox[a],that.getCheckbox());
				            	})
			            	}(i);
			            }
			            that.tr.push(tr);
			            trCF.appendChild(tr);
			        }

			        tbody[0].innerHTML = '';
			        tbody[0].appendChild(trCF);

					//处理悬浮列
					if(this.list.length){
						if(that.fixed){
							var shadowLeft = ice.c('div');
							shadowLeft.className = 'table-shadow-left';
							shadowLeft.style.width = fixedLeft-4 + 'px';
							shadowLeft.style.height = table[0].offsetHeight + 'px';
							if(that.fixedLeft){
								ice(tableBox).append(shadowLeft)
							}
							var shadowRight = ice.c('div');
							shadowRight.className = 'table-shadow-right table-shadow-active';
							shadowRight.style.width = fixedRight-4 + 'px';
							shadowRight.style.height = table[0].offsetHeight + 'px';
							if(that.fixedRight){
								ice(tableBox).append(shadowRight)
							}
							tableBox.onscroll = function(e){
								if(that.fixedLeft){
									if(tableBox.scrollLeft){
										ice(shadowLeft).addCss('table-shadow-active')
									}else{
										ice(shadowLeft).delCss('table-shadow-active')
									}
								}
								if(that.fixedRight){
									if(tableBox.scrollWidth - tableBox.clientWidth == tableBox.scrollLeft){
										ice(shadowRight).delCss('table-shadow-active')
									}else{
										ice(shadowRight).addCss('table-shadow-active')
									}
								}
							}
							setTr = function (){
								ice('.table-fixed').each(function(){
									this.style.height = this.parentNode.offsetHeight+1 + 'px';
									this.style.top = this.parentNode.offsetTop + 'px';
								})
								shadowLeft.style.height = table[0].offsetHeight + 'px';
								shadowRight.style.height = table[0].offsetHeight + 'px';
							}
							//根据父级tr的高度来设置悬浮列的td高度
							ice('.table-fixed').each(function(){
								this.style.height = this.parentNode.offsetHeight+1 + 'px';
								this.style.top = this.parentNode.offsetTop + 'px';
								//图片加载后会使高度变化，也要监听
								!function(that){
									ice(that.parentNode).find('img').on('load',function(){
										that.style.height = that.parentNode.offsetHeight+1 + 'px';
										that.style.top = that.parentNode.offsetTop + 'px';
										shadowLeft.style.height = table[0].offsetHeight + 'px';
										shadowRight.style.height = table[0].offsetHeight + 'px';
									})
								}(this);
							})
							//我不知道发生了什么，第一个tr的offsetTop第一次为1，再次获取时变为0，所以才有了这行代码
							//大家评评理，这叫什么事。。。。
							setTimeout(function(){
								setTr();
							},100)
							ice.on(window, 'resize', function (e) {
								setTr();
							});
							//有可能表格渲染后并没有展示在页面，所以无法获取到tr的高
							if(!tableMain.offsetHeight){
								if(!tableMain.bodySM){
									tableMain.bodySM = function(){
										if(tableMain.offsetHeight && tableMain.offsetHeight !== tableMain.initHeight){
											tableMain.initHeight = tableMain.offsetHeight;
											setTr();
										}
									}
									document.body.addEventListener('DOMSubtreeModified', tableMain.bodySM);
								}
							}
						}
					}

					sortsInit && sortsInit();

			        //显示分页
			        if (!that.data && showPage) {
			            if (count > size) {
			                var quantity = Math.ceil(count / size);
			                //创建a文档碎片
			                var cf = ice.cf();
			                //创建a标签
			                var ca = function(name,text,fn){
			                	let a = ice.c('a');
			                	a.href = '#';
			                	a.className = 'paging-'+name;
			                	a.innerHTML = text;
			                	a.onclick = function(){
			                		ice.sp();
			                		fn && fn();
			                		return false;
			                	}
			                	return a;
			                };
			                
			                //首页
			                if (page == 1) {
			                	cf.appendChild(ca('prev','上一页'));
			                	cf.appendChild(ca('active','1'));
			                } else {
			                	cf.appendChild(ca('prev','上一页',function(){
			                		that.getData(page-1);
			                	}));
			                	cf.appendChild(ca('num','1',function(){
			                		that.getData(1);
			                	}));
			                }

			                //中间部分
			                var quantityMax = quantity - 1;
			                var pageMax = page + 1;
			                var start = (quantity <= 7 || page <= 3) ? 2 : (pageMax < quantityMax) ? (page - 1) : (pageMax == quantityMax ? (page - 2) : (quantity - 4));
			                var end = quantity <= 7 ? quantityMax : (page <= 3) ? 5 : (pageMax >= quantityMax ? quantityMax : pageMax);
			                if (quantity > 7 && page > 3) {
			                	cf.appendChild(ca('el','…',function(){
			                		that.getData(page - 2);
			                	}));
			                }
			                for (var i = start; i <= end; ++i) {
			                    if (i == page) {
			                    	cf.appendChild(ca('active',i));
			                    } else {
			                    	!function(a){(cf.appendChild(ca('num',a,function(){
			                			that.getData(a);
			                		})))}(i);
			                    }
			                }
			                if (quantity > 7 && pageMax < quantityMax) {
			                	cf.appendChild(ca('el','…',function(){
			                		that.getData(end + 1);
			                	}));
			                }
			                //尾页
			                if (quantity == page) {
			                	cf.appendChild(ca('active',quantity));
			                	cf.appendChild(ca('next','下一页'));
			                } else {
			                	cf.appendChild(ca('num',quantity,function(){
			                		that.getData(quantity);
			                	}));
			                	cf.appendChild(ca('next','下一页',function(){
			                		that.getData(page + 1);
			                	}));
			                }
			                var paging = ice('.paging',tableMain);
			                if(!paging.length){
			                	paging = ice.c('div');
			                	paging.className = 'paging paging-line';
			                }else{
			                	paging = paging[0];
			                	paging.innerHTML = '';
			                }
			                paging.appendChild(cf);
			                tableMain.appendChild(paging);
							that.paging = paging;
			            }
			        }

			        //成功回调
			        json.success && json.success.call(that,that);
			        callback && callback.call(that,that);
            	};
            	if(this.data){
            		that.dataInit(this.data);
            	}else{
            		ice[type?type:'post']({
			    		url:this.url,
			    		'data':data,
						header:json.header?json.header:false,
			    		success:function (res){
			    			that.dataInit(res);
				    	},
				    	complete:function(){
				    		table.delCss('iceTable-height');
				    	},
					})
            	}
		    	
			};
			this.getData(this.page);
		}
		//环境变量
	    reviseEnv($str,$data,$index,$list){
	    	var $v = '';
	    	try {
	    		$v = (function(index,list){
					var $_v = eval($str);
		    		return $_v !== undefined ? $_v : '';
	    		}).call($data,$index,$list);
			}
			catch(err) {
				$v = '';
			    console.log(err);
			}
			return $v;
	    }
	    //重载
		render(callback){
			this.getData(this.page,0,callback);
		}
		//删除当前项
		del(index){
			if(typeof index == 'number'){
				if(this.tr[index]){
					ice(this.tr[index]).del();
					// this.checkbox.splice(index,1);
				}
			}else{
				ice(this.el).del();
				// this.checkbox.splice(this.index,1);
			}
		}
	    //获取单选框选中的数据
	    getRadio(){
			var arr = false;
			ice.each(this.radio,function(){
				if(this.checked){
					arr = this;
					return false;
				}
	    	})
	    	return arr;
	    }
		//获取复选框选中的数据列表或某个字段集合
	    getCheckbox(name){
			let arr = [];
			ice.each(this.checkbox,function(){
				if(this.checked) {
					if(name){
						if(this.data[name] != undefined) arr.push(this.data[name]);
					}else{
						arr.push(this)
					}
				}
			})
			return name ? (arr.length ? arr.join(',') : '') : arr;
	    }
	    //全选
	    checkall(){
	    	var that = this;
	    	ice.each(this.checkbox,function(){
	    		ice(this.el).addCss('active');
	    		this.checked = true;
	    		if(that.checkboxName){
    				that.list[this.index][that.checkboxName] = true;
    			}
	    	})
	    	this.theadCheckbox.addCss('active');
	    	json.checkbox && json.checkbox.call(this,this.checkbox);
	    }
	    //反选
	    inverse(){
	    	var that = this;
	    	ice.each(this.checkbox,function(){
	    		ice(this.el).toggleCss('active');
	    		this.checked = this.checked ? false : true;
	    		if(that.checkboxName){
    				that.list[this.index][that.checkboxName] = this.checked;
    			}
	    	})
	    	this.theadCheckboxInit();
	    	json.checkbox && json.checkbox.call(this,this.checkbox);
	    }
	    //全不选
	    deselect(){
	    	ice.each(this.checkbox,function(){
	    		ice(this.el).delCss('active');
	    		this.checked = false;
	    	})
	    	this.theadCheckbox.delCss('active')
	    }
	    theadRadioInit(){
	    	if(this.getRadio()){
	    		this.theadRadio.addCss('active')
	    	}else{
	    		this.theadRadio.delCss('active')
	    	}
	    }
		theadCheckboxInit(){
			var isAll = true;
			ice.each(this.checkbox,function(){
				if(!this.checked){
					isAll = false;
					return false;
				}
			})
	    	if(isAll){
	    		this.theadCheckbox.addCss('active')
	    	}else{
	    		this.theadCheckbox.delCss('active')
	    	}
	    }
    }
    //返回实例
    return new iceTable(json);;
};