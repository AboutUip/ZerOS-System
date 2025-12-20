// 本文件用于应用程序全局枚举量注册(不可更改)
const GroupEnum = {
  // 日志类型
  LogType : {
    // 完成
    SUCCESS : 0,
    // 异常
    EXCEPTION : 1,
    // 警告
    WARRING : 2
  },
  // 日志级别
  LevelType : {
    // 系统级别
    SYSTEM : 0,
    // 模块级别
    MODEL : 1,
    // 函数级别
    FUNCTION : 2
  },
  // 最小模块加载量
  ModuleLoad : {
    // 基础零时间
    ZEROLOAD : 0,
    // 最小加载时间
    SLOWLOAD : 900,
    // 最大加载时间
    FASTLOAD : 1100
  },
  // 屏幕朝向
  SrceenOrientation : {
    // 横屏
    TRANSVERSE : 0,
    // 竖屏
    VERTICAL : 1
  },
  // 加载图片索引
  LoadPicture : {
    // 最小
    MININDEX : 0,
    // 最大
    MAXINDEX : 5
  },
  // 模式枚举量
  ModEnum : {
    // 随机网易云音乐
    RANDOM_NETMUSIC : 0,
    // 助眠钢琴曲
    SLEEP_MUSIC : 1,
    // QQ音乐
    QQ_MUSIC : 2,
    // 搜索列表
    SEARCH_LIST : 3,
    // 随机语录
    NOTICE_MUSIC : 4,
    // 喜欢的歌曲
    LIKE_MUSIC : 5
  },
  //修正参数
  ResetData : {
    // 精确
    FAD : 100,
    // 稍快
    FAT : 300,
    // 正常
    NOM : 500,
    // 缓慢
    SLW : 1000
  },
  // 搜索模式
  SearchMod : {
    // 网易云
    NetEasyMusic : 0,
    // 汽水音乐
    QiShuiMusic : 1,
    // 酷我音乐
    KuwoMusic : 2
  },
  // 播放模式
  PlayerMod : {
    // 单曲循环
    DC_LOOP : 0,
    // 列表循环
    LIST_LOOP : 1,
    // 随机播放
    RAND_LOOP : 2
  }
  // 待办...
};
// 一定要封存对象
Object.freeze(GroupEnum);
