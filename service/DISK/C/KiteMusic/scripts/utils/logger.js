// 本类用于log对象表示
class Log{
  constructor(Logtype,Leveltype,message){
    this._LogType = Logtype;
    this._LevelType = Leveltype;
    this._Message = message;
  }
  // 获取log日志核心数据
  getLogInfo(){
    return {
      LogType : this._LogType,
      LevelType : this._LevelType,
      Message : this._Message
    };
  }
}

// 本类用于Logger记录
class Logger{
  constructor(funcs){
    // 设置log不同类型的缓存位置
    this.logSuccess = new Array();
    this.logException = new Array();
    this.logWarring = new Array();
    this.callback = funcs;
  }
  // 自定义log注册
  pushLog(Logtype,Leveltype,message){
    let log = new Log(Logtype,Leveltype,message);
    switch (Logtype) {
      case GroupEnum.LogType.SUCCESS:
        this.logSuccess.push(log);
        this.callback.success(log);
        break;
      case GroupEnum.LogType.EXCEPTION:
        this.logException.push(log);
        this.callback.exception(log);
        break;
      case GroupEnum.LogType.WARRING:
        this.logWarring.push(log);
        this.callback.warring(log);
        break;
    }
    log = null;
  }
  // 各种封装好的log方法
  success(level,message){
    let log = new Log(GroupEnum.LogType.SUCCESS,level,message);
    this.logSuccess.push(log);
    this.callback.success(log);
    log = null;
  }
  exception(level,message){
    let log = new Log(GroupEnum.LogType.EXCEPTION,level,message);
    this.logException.push(log);
    this.callback.exception(log);
    log = null;
  }
  warring(level,message){
    let log = new Log(GroupEnum.LogType.WARRING,level,message);
    this.logWarring.push(log);
    this.callback.warring(log);
    log = null;
  }
  // 更改日志处理方案
  setCallback(callbacks,hook = false){
    // 判断是否为覆盖模式
    if(hook){
      this.callback = callbacks;
      return true;
    }
    // 否则解析这个新对象
    const newObj = {};
    const successFunc = 'success' in callbacks;
    const exceptionFunc = 'exception' in callbacks;
    const warringFunc = 'warring' in callbacks;
    if(successFunc) newObj.success = callbacks.success;
    if(exceptionFunc) newObj.exception = callbacks.exception;
    if(warringFunc) newObj.warring = callbacks.warring;
    return true;
  }
}

// 对全局Log的简化调用
function LogOf() {
  return GroupVariable.Log;
}