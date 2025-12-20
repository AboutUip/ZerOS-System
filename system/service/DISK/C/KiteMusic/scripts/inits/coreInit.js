// 该函数优先进行各种必需加载的初始化任务
function coreInit() {
  const Log = new Logger({
    // 这里写入log处理的任务
    success : function(log){
      // 暂不处理
      return true;
    },
    exception : function(log){
      // 暂不处理
      return true;
    },
    warring : function(log){
      // 暂不处理
      return true;
    }
  });
  // 把日志对象写入全局变量缓存区
  GroupVariable.Log = Log;
  // 更新样式对象
  GroupVariable.SrceenStyle = document.querySelector('#SrceenFork');
  // 待办...
}
// 之后立即调用它
coreInit();