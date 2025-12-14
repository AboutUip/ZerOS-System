// 本方法负责加载必须模块
function modulesInit() {
  if(GroupStatic.logInstead){
    LogOf().success(GroupEnum.LevelType.FUNCTION,'准备加载模块...');
  }
  // 迭代模块信息对象
  let ModulesKey = Object.keys(ModInfomation);
  let temp = null;
  for (let ModuleKey of ModulesKey) {
    // 更新缓存变量
    temp = ModInfomation[ModuleKey];
    // 迭代加载模块的各种资源
    for(let scriptUrl of temp.script){
      if(!scriptUrl) break;
      importJS(scriptUrl);
    }
    for (let styleUrl of temp.style) {
      if(!styleUrl) break;
      importCSS(styleUrl);
    }
  }
  // 日志记录
  if(GroupStatic.logInstead){
    LogOf().success(GroupEnum.LevelType.FUNCTION,'模块加载完成!');
  }
  // 在一定时间后模块加载完成
  const loadTime = AppUtil.Random.getNumber(GroupEnum.ModuleLoad.SLOWLOAD,GroupEnum.ModuleLoad.FASTLOAD);
  setTimeout(() => {
    // 更新加载状态量
    GroupStatic.coreInited = true;
    // 同时发布一个事件，标明模块加载完成
    let event = new CustomEvent('moduleInited',{
      detail : {
        done : true
      },
      bubbles : true,
      cancelable : true
    });
    document.body.dispatchEvent(event);
    $(".application-load").fadeOut(300);
    $(".application-core").fadeIn(200);
    return true;
  },loadTime);
}
modulesInit();