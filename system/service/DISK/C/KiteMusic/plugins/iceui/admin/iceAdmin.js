/**
 ************************************************************************
 * 后台界面
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2016-07-20
 * 更新：2022-04-27
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */
ice(function(){

	//侧栏隐藏展开-收缩
	ice('.admin-toggle')[0].onclick=function(){
		ice(this).toggleCss('open','close');
		ice('.admin-page').toggleCss('admin-sidebar-close');
		ice('.admin-sidebar').toggleCss('open','close');
	}

	//侧栏菜单隐藏展开-收缩
	ice('.admin-toggle-right')[0].onclick=function(){
		ice('.admin-menu').toggleCss('open','close');
		ice.toggleCss(this,'open');
	}

	//监听侧栏菜单
	ice('.admin-sidebar-menu a').click(function(){
		//移动端收缩菜单
		if(ice.web().w <= 768){
			ice('.admin-toggle').toggleCss('open','close');
			ice('.admin-page').toggleCss('admin-sidebar-close');
			ice('.admin-sidebar').toggleCss('open','close');
		}
		return false;
	});

	//侧栏菜单展开-收缩
	ice.tree({
		el:'#adminTree',
	});
	
	var moveLine = ice('.admin-menu-move');
	//菜单树高亮
	setTimeout(function(){
		var nav = ice('.admin-sidebar-menu a');
		nav.each(function(){
			if(this.href == document.location.origin + document.location.pathname){
				ice(this).addCss('active');
				var ul = this.parentNode.parentNode;
				if(ice(ul).hasCss('admin-menu-dropdown')){
					ice(ul).delCss('tree-close').addCss('tree-open').show().parent().delCss('tree-close').addCss('tree-open')
				}
				moveLine.css('top',ice(this.parentNode).page().y-ice.scroll('y')+'px');
			}else{
				ice(this).delCss('active');
			}
		});
		nav.on('mouseover',function(){
			moveLine.css('top',ice(this).page().y-ice.scroll('y')+'px');
		})
		nav.on('mouseout',function(){
			moveLine.css('top',ice('.admin-sidebar-menu .active').page().y+'px');
		})
	},300);
});