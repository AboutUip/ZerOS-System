// 本文件用于管理应用程序屏幕相关
function updataSrceenStyle() {
  // 依据当前方向进行更新
  switch (GroupStatic.orientation) {
    // 如果是竖屏
    case GroupEnum.SrceenOrientation.VERTICAL:
      GroupVariable.SrceenStyle.setAttribute('href','styles/mods/Vertical.css');
      break;
    // 如果是横屏
    case GroupEnum.SrceenOrientation.TRANSVERSE:
      GroupVariable.SrceenStyle.setAttribute('href','styles/mods/Transverse.css');
      break;
  }
  // 待办...
}
// 立即更新
updataSrceenStyle();