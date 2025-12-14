// 本文件用于控制应用程序所有的全局变量以及外置常量
const GroupVariable = {
  // 日志记录对象
  Log : null,
  // 屏幕方向样式表对象
  SrceenStyle : null,
  // 核心Swiper对象
  AppCoreSwiper : null,
  // QQ音乐数据
  QQMusicData : null,
  // 歌曲列表
  MusicList : [],
  // 当前歌曲id
  NowMusicId : -1,
  // 是否已初始化下一首歌曲
  IsInitNextM : false,
  // 下一首歌的数据
  NextMusicData : null,
  // 上一首歌的数据
  LastMusicData : null,
  // 当前页面值(1为0页列表)
  SelfPageId : 0,
  // 页面Swiper
  MainSwiper : null,
  // 当前播放词索引
  PlayIndex : 1,
  // searchTemp
  SearchDataTemp : 0,
  // 缓存核心音乐对象
  AudOb : null,
  // 缓存搜索词
  tempSear : '',
  // 缓存完好解析相应
  saveParseData : [],
  // 搜索模式
  searchMod : GroupEnum.SearchMod.NetEasyMusic,
  // 播放模式
  PlayMod : GroupEnum.PlayerMod.LIST_LOOP,
  // 播放列表对象
  PlayListSwiper : null,
  // 搜索列表缓存
  searchTemp : [],
  // 歌词数据
  LrcMap : (new Map()),
  // 歌词计时器
  lrcTime : 0,
  // 是否继续进行计时器
  isAllowLrcTimer : false,
  // layer暂存对象
  layerTempID : null,
  // 缓存搜索热歌
  hotSearchData : null,
  // 当前歌曲是否为喜欢的歌曲
  likeMusicOfThis : false,
  // 喜欢的音乐
  likeListColl : [],
  // 原始歌词
  atLosterLrc : ''
};