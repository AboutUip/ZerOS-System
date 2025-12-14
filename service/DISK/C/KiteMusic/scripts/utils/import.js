// 本函数用于导入js代码
function importJS(url) {
  try{
    const scriptElem = document.createElement('script');
    scriptElem.setAttribute('src',url);
    document.body.appendChild(scriptElem);
    if(GroupStatic.logInstead){
      LogOf().success(GroupEnum.LevelType.MODEL,`加载模块${url}...`);
    }
    return true;
  } catch (e) {
    if(GroupStatic.logInstead){
      LogOf().exception(GroupEnum.LevelType.MODEL,`模块${url}加载失败:${e.toString()}`);
    }
    return false;
  }
}

// 本函数用于导入css代码
function importCSS(url) {
  try {
    const linkElem = document.createElement('link');
    linkElem.setAttribute('rel','stylesheet');
    linkElem.setAttribute('href',url);
    document.body.appendChild(linkElem);
    if(GroupStatic.logInstead){
      LogOf().success(GroupEnum.LevelType.MODEL,`加载样式表${url}...`);
    }
    return true;
  } catch (e) {
    if(GroupStatic.logInstead){
      LogOf().exception(GroupEnum.LevelType.MODEL,`加载样式表${url}失败:${e.toString()}`);
    }
    return false;
  }
}