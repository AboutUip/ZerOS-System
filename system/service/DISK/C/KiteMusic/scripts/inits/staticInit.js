// 该函数用于初始化必需数据量
function updataStaticData() {
  AppUtil.Setting.init('CORE__APPLICATION__INITED_SYMBOL');

  // 初始化操作
  if(!AppUtil.Setting.getItem('isinit')){
    AppUtil.Setting.setItem('text-size',16);
    AppUtil.Setting.setItem('likeMusicMap',{});
    AppUtil.Setting.setItem('isinit',true);
  }

  // 更新字体大小
  let ts = AppUtil.Setting.getItem('text-size');
  $('#header').css('font-size',ts + 'px');
  $('html').css('font-size',ts + 'px');

  // 更新喜欢的歌曲
  GroupVariable.likeListColl = AppUtil.Setting.getItem('likeMusicMap');
  for (const value of Object.keys(GroupVariable.likeListColl)) {
    if(GroupVariable.likeListColl[value] == null) return false;
    GroupVariable.likeListColl[value].music_init = false;
  }
  return true;
}
// 加载时立即调用
updataStaticData();