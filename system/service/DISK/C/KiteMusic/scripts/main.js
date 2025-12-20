// 保存原来的id
let lastPageId = 0;
const LrcElement = document.getElementById("MPAD");
const AudOb = new Audio();
// 核心音乐播放对象
GroupVariable.AudOb = AudOb;
let audLeng;
let audEnd;
let step;
let donef = false;
let porsur = false;
let timer = setInterval(() => {}, 999999999);
let timec = setTimeout(() => {}, 999999999);
let timed = setTimeout(() => {},999999999);
let ni = 0;
let temped = 0;
let isRight = false;

// 入口函数
function main() {
  // 横屏处理
  if (GroupStatic.orientation == GroupEnum.SrceenOrientation.VERTICAL) {
    // 导入样式表
    importCSS("styles/mods/Vertical.css");
    // 描述模式flager
    let figlMod = GroupEnum.ModEnum.RANDOM_NETMUSIC;
    // 输入框元素(搜索)
    const inputElemOf = document.querySelector("#searinput");
    // 搜索词保存
    let tempSear = "";
    let lastLrc = null;
    let nowLrc = null;
    // 提前优化
    if (GroupStatic.enableJava) {
      JavaUtil.hideStatusBar();
    }

    // 对模块加载完成进行监听
    document.body.addEventListener("moduleInited", (event) => {
      event.stopPropagation();
      event.preventDefault();
      mui.toast("Welcome~  今天是KiteMusic陪伴你的第x天~");
      const swiper = new Swiper("#colll", {
        loop: false,
        parallax: true,
        wrapperClass: "sww",
        slideClass: "ss",
        initialSlide: 1,
        allowSlidePrev: false,
        nested : true,
        noSwiping : true,
        noSwipingClass : 'no-swiper',
        on: {
          activeIndexChange: function (swiper,event) {
            inputElemOf.value = "";
            setTimeout(function () {
              ViewUtil.Rond.rondHotSearch();
            }, 300);
            ViewUtil.NavTouch.changPage(this);
            if(swiper.activeIndex == 2){
              swiper.allowSlideNext = false;
              isRight = false;
            }else{
              swiper.allowSlideNext = true;
            }
          },
        }
      });
      GroupVariable.MainSwiper = swiper;
      $(".nav-core").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        let target = event.target;
        if (target.tagName.toLowerCase() == "img") {
          let ind = Number.parseInt(target.parentNode.dataset.isa);
          swiper.slideTo(ind);
        }
      });

      // 对横向滑动做交互
      // $('.putmod').on('touchstart mousedown',(event) => {
      //   event.stopPropagation();
      //   event.preventDefault();
      //   console.log(11);
      //   swiper.disable();
      // });
      // $('.putmod').on('touchend mouseup',(event) => {
      //   event.stopPropagation();
      //   event.preventDefault();
      //   console.log(22);
      //   swiper.enable();
      // });

      // 歌曲切歌功能
      const SPT = new Swiper("#tarr", {
        wrapperClass: "warr",
        slideClass: "tn",
        loop: true,
        initialSlide: 1,
        touchMoveStopPropagation: true,
        on: {
          // 点击双击事件
          click: function (swiper, event) {
            ViewUtil.MusicColl.MPlayer(true);
            ViewUtil.Rond.rondMPlayer(null, AudOb);
            if (GroupVariable.SelfPageId == 1) {
              GroupVariable.SelfPageId = 3;
            } else {
              GroupVariable.SelfPageId = 2;
            }
          },
          doubleClick: function (swiper, event) {
            console.log(event);
            mui.toast("暂不支持收藏功能");
          },
          // 滑动事件
          slideChangeTransitionEnd: function () {
            GroupVariable.PlayIndex = this.realIndex;
            if (this.swipeDirection == "next") {
              if (GroupVariable.PlayMod == GroupEnum.PlayerMod.RAND_LOOP) {
                if (figlMod == GroupEnum.ModEnum.QQ_MUSIC) {
                  let randoms = AppUtil.Random.getNumber(
                    0,
                    GroupVariable.QQMusicData.length - 1
                  );
                  GroupVariable.NowMusicId = randoms;
                } else {
                  let random_num = AppUtil.Random.getNumber(
                    0,
                    GroupVariable.saveParseData.length - 1
                  );
                  GroupVariable.NowMusicId = random_num;
                }
              }
              AppUtil.Select.slem(AudOb, this, figlMod);
              $(".mcc-pp > img").attr("src", "icons/play.svg");
            } else {
              AppUtil.Select.priv(AudOb, this, figlMod);
            }
          },
        },
      });

      // 渲染设置页面各种滑动条
      layui.slider.render({
        elem : "#text-size-slider",
        min : 5,
        max : 20,
        value : AppUtil.Setting.getItem('text-size'),
        tips: true,
        done(value){
          $('#header').css('font-size',value + 'px');
          $('html').css('font-size',value + 'px');
          AppUtil.Setting.setItem('text-size',value);
        }
      });

      // 处理音乐进度条
      const PROGELEM = layui.slider.render({
        elem: "#LoadProgFoor",
        max: 1000,
        tips: false,
        theme: "#31bdec",
        // 进度条渲染
        done: function (value) {
          if (donef) return;
          porsur = false;
          let temp = audLeng;
          if (!AudOb.src) {
            this.value = 0;
            return;
          }
          let neop = step * value;
          if (neop >= temp) {
            ni += Math.floor((neop - temp) / step);
          } else {
            ni -= Math.floor((temp - neop) / step);
          }
          AudOb.currentTime = neop * 0.001;
          let n = Number.parseInt(AudOb.currentTime * 10);
          let last = 0;
          GroupVariable.lrcTime = n;
          $(".first-ui").text(GroupVariable.LrcMap.get(n));
          let tim = AppUtil.Parsed.timeParse(Math.floor(AudOb.currentTime));
          $(".LP-this").text(tim);
          for (let key of GroupVariable.LrcMap.keys()) {
            if (n <= key && last != 0) {
              nowLrc = LrcElement.querySelector(`.lrc${last}`);
              nowLrc.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              nowLrc.classList.add("click-lrc");
              if (lastLrc == null) {
                lastLrc = nowLrc;
                break;
              }
              lastLrc.classList.remove("click-lrc");
              lastLrc = nowLrc;
              break;
            }
            last = key;
          }
          let ca = false;
          for (let key of GroupVariable.LrcMap.keys()) {
            if (ca) {
              $(".sende-ui").text(GroupVariable.LrcMap.get(key));
              break;
            }
            if (key == n) {
              ca = true;
              continue;
            }
          }
        },
      });

      // 歌曲列表对象
      const SLSwiper = new Swiper("#musicListSwiper", {
        wrapperClass: "music_list_wrapper",
        slideClass: "music_list_slide",
        effect: "coverflow",
        slidesPerView: 3,
        centeredSlides: true,
        coverflowEffect: {
          rotate: 30,
          stretch: 10,
          depth: 60,
          modifier: 2,
          slideShadows: true,
        },
        nested: true,
        on: {
          // 点击切换歌曲
          click(swiper, event) {
            event.stopPropagation();
            event.preventDefault();
            let id = swiper.activeIndex;
            // 判断模式
            switch (figlMod) {
              // QQ音乐
              case GroupEnum.ModEnum.QQ_MUSIC:
                GroupVariable.IsInitNextM = false;
                GroupVariable.NextMusicData = null;
                let data = GroupVariable.QQMusicData[id];
                GroupVariable.NowMusicId = id;
                AudOb.src = data.url;
                AudOb.play();
                ViewUtil.MusicColl.updataSM(
                  data.song,
                  data.img,
                  AudOb,
                  data.singer
                );
                ViewUtil.MusicColl.roat(true);
                break;
              // 喜欢的音乐
              case GroupEnum.ModEnum.LIKE_MUSIC:
                GroupVariable.IsInitNextM = false;
                GroupVariable.NextMusicData = null;
                GroupVariable.NowMusicId = id;
                let datd = GroupVariable.likeListColl[event.target.dataset.nllid];
                AppUtil.Parsed.parseLikeData(AudOb,datd);
                break;
              // 搜索歌曲
              case GroupEnum.ModEnum.SEARCH_LIST:
                AppUtil.Music.updateNetGet(id + 1, tempSear, AudOb);
                // 渲染数据
                let datas = new Array();
                GroupVariable.searchTemp.forEach((data, index) => {
                  let temp = GroupVariable.saveParseData[index];
                  if (temp != null) {
                    datas.push(temp);
                    return;
                  }
                  datas.push({
                    title: data.title,
                    singer: data.singer,
                    cover: "images/icon/netmusic.png",
                  });
                });
                ViewUtil.Rond.rondMList(datas, figlMod);
                GroupVariable.PlayListSwiper.slideTo(
                  GroupVariable.NowMusicId,
                  1
                );
                break;
              // 正常处理
              case GroupEnum.ModEnum.RANDOM_NETMUSIC:
              case GroupEnum.ModEnum.SLEEP_MUSIC:
                GroupVariable.NowMusicId = id;
                let datae = GroupVariable.MusicList[GroupVariable.NowMusicId];
                AudOb.src = datae.url;
                if (datae.hasOwnProperty("lrc"))
                  AppUtil.Parsed.LrcData(datae.lrc);
                AudOb.play();
                ViewUtil.MusicColl.updataSM(
                  datae.song,
                  datae.img,
                  AudOb,
                  datae.singer
                );
                ViewUtil.MusicColl.roat(true);
                ViewUtil.Rond.rondSName(
                  datae.song,
                  GroupVariable.MusicList[GroupVariable.NowMusicId + 1].song,
                  datae.singer
                );
                GroupVariable.PlayListSwiper.slideTo(
                  GroupVariable.NowMusicId,
                  1
                );
                break;
            }
          },
        },
      });
      GroupVariable.PlayListSwiper = SLSwiper;

      // 全屏歌曲播放页事件监听
      $(".mcc-up > img").click(function () {
        AppUtil.Select.priv(AudOb, this, figlMod);
        $(".mcc-pp > img").attr("src", "icons/play.svg");
      });
      $(".mcc-down > img").click(function () {
        if (GroupVariable.PlayMod == GroupEnum.PlayerMod.RAND_LOOP) {
          if (figlMod == GroupEnum.ModEnum.QQ_MUSIC) {
            let randoms = AppUtil.Random.getNumber(
              0,
              GroupVariable.QQMusicData.length - 1
            );
            GroupVariable.NowMusicId = randoms;
          } else {
            let random_num = AppUtil.Random.getNumber(
              0,
              GroupVariable.saveParseData.length - 1
            );
            GroupVariable.NowMusicId = random_num;
          }
        }
        AppUtil.Select.slem(AudOb, this, figlMod);
        $(".mcc-pp > img").attr("src", "icons/play.svg");
      });
      $(".mcc-mod > img").click(function () {
        switch (GroupVariable.PlayMod) {
          // 列表循环
          case GroupEnum.PlayerMod.LIST_LOOP:
            if (
              figlMod == GroupEnum.ModEnum.RANDOM_NETMUSIC ||
              figlMod == GroupEnum.ModEnum.SLEEP_MUSIC ||
              figlMod == GroupEnum.ModEnum.NOTICE_MUSIC
            ) {
              GroupVariable.PlayMod = GroupEnum.PlayerMod.DC_LOOP;
              $(".mcc-mod > img").attr("src", "icons/dc_loop.svg");
            } else {
              GroupVariable.PlayMod = GroupEnum.PlayerMod.RAND_LOOP;
              $(".mcc-mod > img").attr("src", "icons/rand_loop.svg");
            }
            break;
          // 随机列表
          case GroupEnum.PlayerMod.RAND_LOOP:
            GroupVariable.PlayMod = GroupEnum.PlayerMod.DC_LOOP;
            $(".mcc-mod > img").attr("src", "icons/dc_loop.svg");
            break;
          // 单曲循环
          case GroupEnum.PlayerMod.DC_LOOP:
            GroupVariable.PlayMod = GroupEnum.PlayerMod.LIST_LOOP;
            $(".mcc-mod > img").attr("src", "icons/list_loop.svg");
            break;
        }
      });

      // 监听点赞交互
      $('.mcc-like').click(function(event){
        event.stopPropagation();
        event.preventDefault();
        if(GroupVariable.likeMusicOfThis){
          // 更新到不喜欢
          GroupVariable.likeMusicOfThis = false;
          ViewUtil.Rond.rondLikeIcon(false);
          let music_data = AppUtil.Parsed.parseMusicId(figlMod,GroupVariable.searchMod).music_id;
          GroupVariable.likeListColl[music_data] = null;
          AppUtil.Setting.setItem('likeMusicMap',GroupVariable.likeListColl);
          ViewUtil.Rond.rondLikeList();
        }else{
          // 更新到喜欢
          if(
            (figlMod == GroupEnum.ModEnum.NOTICE_MUSIC) ||
            (figlMod == GroupEnum.ModEnum.SLEEP_MUSIC) ||
            (figlMod == GroupEnum.ModEnum.QQ_MUSIC)
          ){
            // 这三种模式不允许进行喜欢操作
            mui.toast("该模式暂未支持喜欢.");
            return false;
          }
          GroupVariable.likeMusicOfThis = true;
          ViewUtil.Rond.rondLikeIcon(true);
          let music_data = AppUtil.Parsed.parseMusicId(figlMod,GroupVariable.searchMod);
          if(GroupVariable.atLosterLrc != ''){
            music_data.music_lrc = GroupVariable.atLosterLrc;
          }
          GroupVariable.likeListColl[music_data.music_id] = music_data;
          AppUtil.Setting.setItem('likeMusicMap',GroupVariable.likeListColl);
          ViewUtil.Rond.rondLikeList();
        }
      });

      // 展示歌曲列表
      $(".mcc-list > img").click(function (event) {
        if (GroupVariable.SelfPageId == 4 || GroupVariable.SelfPageId == 5) {
          onBackPressed();
          return;
        }
        $(".mpa-define").fadeOut();
        $(".mpa-select").fadeIn();
        GroupVariable.PlayListSwiper.slideTo(GroupVariable.NowMusicId, 1);
        if (GroupVariable.SelfPageId == 2) {
          GroupVariable.SelfPageId = 4;
        } else {
          GroupVariable.SelfPageId = 5;
        }
      });

      // 模式选择
      $(".box-ses").click(function (event) {
        let target = event.target;
        let tagname = target.tagName.toLowerCase();
        if (target.dataset.car == "searchmod") {
          swiper.allowSlidePrev = true;
          swiper.slideTo(0);
          $(".qq-page").css("display", "none");
          $(".search-page").css("display", "block");
          GroupVariable.SelfPageId = 1;
          return;
        }
        if (ViewUtil.MusicColl.isAnimeing) return;
        if (tagname == "img" || tagname == 'p') {
          target = target.parentNode;
          let car = target.dataset.car;
          switch (car) {
            // 随机网易云处理
            case "netmusic":
              GroupVariable.MusicList = [];
              GroupVariable.NowMusicId = 0;
              GroupVariable.IsInitNextM = false;
              AppUtil.Music.fetNetMusic(AudOb, SPT);
              figlMod = GroupEnum.ModEnum.RANDOM_NETMUSIC;
              $(".net").addClass("showThis");
              $(".sleep").removeClass("showThis");
              $(".qqmus").removeClass("showThis");
              $(".searchm").removeClass("showThis");
              $(".notices").removeClass("showThis");
              if (GroupVariable.PlayMod == GroupEnum.PlayerMod.RAND_LOOP) {
                $(".mcc-mod > img").click();
              }
              ViewUtil.Rond.rondMList(GroupVariable.MusicList, figlMod);
              break;
            // 随机助眠处理
            case "sleepmusic":
              GroupVariable.MusicList = [];
              GroupVariable.NowMusicId = 0;
              GroupVariable.IsInitNextM = false;
              AppUtil.Music.fetSleepMusic(AudOb, SPT);
              figlMod = GroupEnum.ModEnum.SLEEP_MUSIC;
              $(".sleep").addClass("showThis");
              $(".net").removeClass("showThis");
              $(".qqmus").removeClass("showThis");
              $(".searchm").removeClass("showThis");
              $(".notices").removeClass("showThis");
              if (GroupVariable.PlayMod == GroupEnum.PlayerMod.RAND_LOOP) {
                $(".mcc-mod > img").click();
              }
              ViewUtil.Rond.rondMList(GroupVariable.MusicList, figlMod);
              break;
            // 随机语录故事处理
            case "noticemusic":
              GroupVariable.MusicList = [];
              GroupVariable.NowMusicId = 0;
              GroupVariable.IsInitNextM = false;
              AppUtil.Music.fetNoticeMusic(AudOb,SPT);
              figlMod = GroupEnum.ModEnum.NOTICE_MUSIC;
              $(".sleep").removeClass("showThis");
              $(".net").removeClass("showThis");
              $(".qqmus").removeClass("showThis");
              $(".searchm").removeClass("showThis");
              $(".notices").addClass("showThis");
              if (GroupVariable.PlayMod == GroupEnum.PlayerMod.RAND_LOOP) {
                $(".mcc-mod > img").click();
              }
              ViewUtil.Rond.rondMList(GroupVariable.MusicList, figlMod);
              break;
            // 随机QQ音乐处理
            case "qqmusic":
              swiper.allowSlidePrev = true;
              swiper.slideTo(0);
              GroupVariable.SelfPageId = 1;
              $(".search-page").css("display", "none");
              $(".setting-page").css("display", "none");
              $(".qq-page").css("display", "block");
              if (GroupVariable.QQMusicData == null) {
                AppUtil.Music.fetQQMusic();
              }
              break;
            // 搜索音乐
            case "searchmod":
              swiper.allowSlidePrev = true;
              swiper.slideTo(0);
              GroupVariable.SelfPageId = 1;
              $(".qq-page").css("display", "none");
              $(".setting-page").css("display", "none");
              $(".search-page").css("display", "block");
              break;
            // 设置
            case "setting":
              swiper.allowSlidePrev = true;
              swiper.slideTo(0);
              GroupVariable.SelfPageId = 1;
              $(".qq-page").css("display", "none");
              $(".search-page").css("display", "none");
              $(".setting-page").css("display", "block");
              break;
          }
        }
      });

      // 对音乐结束进行监听处理
      AudOb.addEventListener("ended", (event) => {
        event.stopPropagation();
        event.preventDefault();
        switch (GroupVariable.PlayMod) {
          case GroupEnum.PlayerMod.LIST_LOOP:
            AppUtil.Select.slem(AudOb, SPT, figlMod);
            break;
          case GroupEnum.PlayerMod.RAND_LOOP:
            switch (figlMod) {
              case GroupEnum.ModEnum.QQ_MUSIC:
                let randoms = AppUtil.Random.getNumber(
                  0,
                  GroupVariable.QQMusicData.length - 1
                );
                GroupVariable.NowMusicId = randoms;
                AppUtil.Select.slem(AudOb, SPT, figlMod);
                break;
              case GroupEnum.ModEnum.SEARCH_LIST:
                let random_num = AppUtil.Random.getNumber(
                  0,
                  GroupVariable.saveParseData.length - 1
                );
                GroupVariable.NowMusicId = random_num;
                AppUtil.Select.slem(AudOb, SPT, figlMod);
                break;
              case GroupEnum.ModEnum.LIKE_MUSIC:
                let datas = Object.values(GroupVariable.likeListColl);
                let leng = datas.length - 1;
                let randNumber;
                while(true){
                  randNumber = AppUtil.Random.getNumber(0,leng);
                  if(datas[randNumber] == null) continue;
                  AppUtil.Parsed.parseLikeData(AudOb,datas[randNumber]);
                  break;
                }
                break;
            }
            break;
          case GroupEnum.PlayerMod.DC_LOOP:
            AudOb.play();
            break;
        }
      });

      // 对搜索模式做监听
      $(".toggle-coll > img").click(function (event) {
        if (GroupVariable.tempSear != "") {
          inputElemOf.value = GroupVariable.tempSear;
        }
        if (GroupVariable.searchMod == GroupEnum.SearchMod.NetEasyMusic) {
          // 汽水音乐
          GroupVariable.searchMod = GroupEnum.SearchMod.QiShuiMusic;
          $(".toggle-coll > img").attr("src", "icons/qishui.svg");
          $(".sear-coll > img").click();
          return;
        } else if (GroupVariable.searchMod == GroupEnum.SearchMod.QiShuiMusic) {
          // 酷我音乐
          GroupVariable.searchMod = GroupEnum.SearchMod.KuwoMusic;
          $(".toggle-coll > img").attr("src", "icons/kuwo.svg");
          $(".sear-coll > img").click();
        } else {
          // 网易云
          GroupVariable.searchMod = GroupEnum.SearchMod.NetEasyMusic;
          $(".toggle-coll > img").attr("src", "icons/wangyiyun.svg");
          $(".sear-coll > img").click();
        }
      });

      // 对搜索监听处理
      $(".sear-coll > img").click(function (event) {
        if (inputElemOf.value == "") return;
        tempSear = inputElemOf.value;
        GroupVariable.tempSear = tempSear;
        if (GroupVariable.searchMod == GroupEnum.SearchMod.NetEasyMusic) {
          // 网易云
          AppUtil.SraechOf.NetMusic(tempSear);
        } else if (GroupVariable.searchMod == GroupEnum.SearchMod.QiShuiMusic) {
          // 汽水
          AppUtil.SraechOf.QSMusic(tempSear);
        } else {
          // 酷我
          AppUtil.SraechOf.KWMusic(tempSear);
        }
      });
      inputElemOf.addEventListener("keydown", (event) => {
        if (event.keyCode == 13) {
          $(".sear-coll > img").click();
        }
      });

      // 搜索歌曲列表点击
      $(".sear-list-coll").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        let target = event.target;
        let tagname = target.tagName.toLowerCase();
        let n = 0;
        if (tagname == "div") {
          n = Number.parseInt(target.dataset.n);
        } else if (tagname == "p") {
          // 热词自动搜索监听
          let cdataOf = target.dataset.fmid;
          inputElemOf.value = cdataOf;
          $(".sear-coll > img").click();
          return true;
        } else {
          n = Number.parseInt(target.parentNode.dataset.n);
        }
        if (Number.isNaN(n)) return false;
        if (figlMod != GroupEnum.ModEnum.SEARCH_LIST) {
          $(".net").removeClass("showThis");
          $(".sleep").removeClass("showThis");
          $(".qqmus").removeClass("showThis");
          $(".searchm").addClass("showThis");
        }
        GroupVariable.MusicList = [];
        figlMod = GroupEnum.ModEnum.SEARCH_LIST;
        AppUtil.Music.updateNetGet(n, tempSear, AudOb);
        // 渲染数据
        let datas = new Array();
        GroupVariable.searchTemp.forEach((data, index) => {
          let temp = GroupVariable.saveParseData[index];
          if (temp != null) {
            datas.push(temp);
            return;
          }
          if(GroupVariable.searchMod == GroupEnum.SearchMod.QiShuiMusic){
            datas.push({
              title: data.title,
              singer: data.singer,
              cover: data.cover,
            });
            return true;
          }
          datas.push({
            title: data.title,
            singer: data.singer,
            cover: "images/icon/netmusic.png",
          });
        });
        // 自动展开音乐播放界面
        ViewUtil.MusicColl.MPlayer(true);
        ViewUtil.Rond.rondMPlayer(null, AudOb);
        if (GroupVariable.SelfPageId == 1) {
          GroupVariable.SelfPageId = 3;
        } else {
          GroupVariable.SelfPageId = 2;
        }
        ViewUtil.Rond.rondMList(datas, figlMod);
      });

      // 对音乐列表的交互优化
      $(".mpa-select").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        let clsname = event.target.className;
        if (clsname != "mpa-select") return;
        $(".mcc-list > img").click();
      });

      // 歌手自搜索
      $(".mpadc-sing > p").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        swiper.allowSlidePrev = true;
        swiper.slideTo(0);
        $(".qq-page").css("display", "none");
        $(".setting-page").css("display", "none");
        $(".search-page").css("display", "block");
        onBackPressed();
        GroupVariable.SelfPageId = 1;
        let textav = $(".mpadc-sing > p").text();
        inputElemOf.value = textav;
        $(".sear-coll > img").click();
      });

      // 歌词预览处理
      $(".mpadc-lrc").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        $(".mpad-cont").fadeOut();
        $(".mpad-lrc").fadeIn();
        lastPageId = GroupVariable.SelfPageId;
        GroupVariable.SelfPageId = 6;
        // 歌词处理
        let n = Number.parseInt(AudOb.currentTime * 10);
        let last = 0;
        for (let key of GroupVariable.LrcMap.keys()) {
          if (n <= key && last != 0) {
            nowLrc = LrcElement.querySelector(`.lrc${last}`);
            nowLrc.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            break;
          }
          last = key;
        }
      });
      $(".mpad-lrc").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        if (event.target.tagName.toLowerCase() == "p") {
          let datat = Number.parseInt(event.target.dataset.lrctime);
          if (Number.isNaN(datat)) {
            $(".mpad-lrc").fadeOut();
            $(".mpad-cont").fadeIn();
            GroupVariable.SelfPageId = lastPageId;
            lastPageId = 0;
            return;
          }
          AudOb.currentTime = datat * 0.1;
          let leng = Number.parseInt(AudOb.currentTime * 1000);
          ni = Math.ceil(leng / step);
          GroupVariable.lrcTime = datat;
          $(".first-ui").text(GroupVariable.LrcMap.get(datat));
          nowLrc = LrcElement.querySelector(`.lrc${datat}`);
          nowLrc.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          nowLrc.classList.add("click-lrc");
          if (lastLrc == null) {
            lastLrc = nowLrc;
          } else {
            lastLrc.classList.remove("click-lrc");
            lastLrc = nowLrc;
          }
          let ca = false;
          for (let key of GroupVariable.LrcMap.keys()) {
            if (ca) {
              $(".sende-ui").text(GroupVariable.LrcMap.get(key));
              break;
            }
            if (key == datat) {
              ca = true;
              continue;
            }
          }
        } else {
          $(".mpad-lrc").fadeOut();
          $(".mpad-cont").fadeIn();
          GroupVariable.SelfPageId = lastPageId;
          lastPageId = 0;
        }
      });

      // 喜欢-歌单
      $(".likem-coll").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        let target = event.target;
        let tagname = target.tagName.toLowerCase();
        let n = 0;
        if (tagname == "img" || tagname == "span" || tagname == "p") {
          target = target.parentNode;
          tagname = "div";
        }
        if (tagname == "div" && target.className == "like-music-coll") {
          if (figlMod != GroupEnum.ModEnum.LIKE_MUSIC) {
            figlMod = GroupEnum.ModEnum.LIKE_MUSIC;
            GroupVariable.MusicList = [];
            ViewUtil.Rond.rondMList(GroupVariable.likeListColl, figlMod);
            $(".net").removeClass("showThis");
            $(".sleep").removeClass("showThis");
            $(".searchm").removeClass("showThis");
            $(".qqmus").removeClass("showThis");
          }
          GroupVariable.IsInitNextM = false;
          GroupVariable.NextMusicData = null;
          n = Number.parseInt(target.dataset.nd);
          GroupVariable.NowMusicId = n;
          let data = GroupVariable.likeListColl[target.dataset.musicid];
          AppUtil.Parsed.parseLikeData(AudOb,data);
        }
      });

      // QQ切歌
      $(".qqm-coll").click(function (event) {
        event.stopPropagation();
        event.preventDefault();
        let target = event.target;
        let tagname = target.tagName.toLowerCase();
        let n = 0;
        if (tagname == "img" || tagname == "span" || tagname == "p") {
          target = target.parentNode;
          tagname = "div";
        }
        if (tagname == "div" && target.className == "qq-music-coll") {
          if (figlMod != GroupEnum.ModEnum.QQ_MUSIC) {
            GroupVariable.MusicList = GroupVariable.QQMusicData;
            figlMod = GroupEnum.ModEnum.QQ_MUSIC;
            ViewUtil.Rond.rondMList(GroupVariable.MusicList, figlMod);
            $(".net").removeClass("showThis");
            $(".sleep").removeClass("showThis");
            $(".searchm").removeClass("showThis");
            $(".qqmus").addClass("showThis");
          }
          GroupVariable.IsInitNextM = false;
          GroupVariable.NextMusicData = null;
          n = Number.parseInt(target.dataset.n);
          let data = GroupVariable.QQMusicData[n];
          GroupVariable.NowMusicId = n;
          let idf = n;
          AudOb.src = data.url;
          AudOb.play();
          fetch(
            `https://www.hhlqilongzhu.cn/api/dg_geci.php?msg=${data.song} ${data.singer}&type=2&n=1`
          )
            .then((response) => response.text())
            .then((lrc) => {
              GroupVariable.QQMusicData[idf].lrc = lrc;
              AppUtil.Parsed.LrcData(lrc);
            })
            .catch((e) => {
              console.log(e);
              mui.toast(e.toString());
            });
          ViewUtil.MusicColl.updataSM(data.song, data.img, AudOb, data.singer);
          ViewUtil.MusicColl.roat(true);
          ViewUtil.Rond.rondMPlayer(null, AudOb);
          // 自动展开歌曲页面(默认禁用)
          // ViewUtil.MusicColl.MPlayer(true);
          // if (GroupVariable.SelfPageId == 1) {
          //   GroupVariable.SelfPageId = 3;
          // } else {
          //   GroupVariable.SelfPageId = 2;
          // }
        }
      });

      // 黑科技,保证长时间滑动进度条不出问题
      $(".layui-slider-wrap-btn").on("touchstart mousedown", function (event) {
        porsur = true;
      });

      // 个人页面的功能交互
      $('.ud-noc').click(function(event){
        event.stopPropagation();
        event.preventDefault();
        let tagname = event.target.tagName.toLowerCase();
        let clsname = event.target.className.toLowerCase();
        if(clsname == 'ud-noc') return false;
        let clickId;
        if(clsname == 'udn-coll'){
          clickId = event.target.dataset.udnc;
        }
        if(tagname == 'img' || tagname == 'p'){
          clickId = event.target.parentNode.dataset.udnc;
        }
        // 处理事件
        isRight = true;
        swiper.allowSlideNext = true;
        swiper.slideTo(3);
        GroupVariable.SelfPageId = 1;
        switch(clickId){
          case 'like':
            $('.like-page').css('display','block');
            $('.aboutus-page').css('display','none');
            $('.download-page').css('display','none');
            ViewUtil.Rond.rondLikeList();
            break;
          case 'about':
            $('.like-page').css('display','none');
            $('.aboutus-page').css('display','block');
            $('.download-page').css('display','none');
            break;
          case 'heatld':
            $('.like-page').css('display','none');
            $('.aboutus-page').css('display','none');
            $('.download-page').css('display','block');
            break;
        }
      });

      // 对更多进行处理
      $(".more-btn > img").click(function (event) {
        event.stopPropagation();
        event.preventDefault();

        // 弹出窗口
        GroupVariable.layerTempID = layui.layer.open({
          type: 1,
          title: "More For This Song.",
          content: "暂无实现内容",
          area: ["100%", "200px"],
          offset: "b",
          anim: "slideUp",
          closeBtn: 0,
          skin: "layui-layer-lan",
          shade: 0.5,
          resize: false,
          minStack: false,
          shadeClose: true,
          move: false,
          end: function () {
            if (temped == 0) {
              GroupVariable.SelfPageId = lastPageId;
            } else {
              GroupVariable.SelfPageId = lastPageId;
              lastPageId = temped;
              temped = 0;
            }
          },
        });
        if (lastPageId != 0) {
          // 对歌词弹出做处理
          temped = lastPageId;
          lastPageId = GroupVariable.SelfPageId;
          GroupVariable.SelfPageId = 7;
        } else {
          // 对理想情况进行处理
          lastPageId = GroupVariable.SelfPageId;
          GroupVariable.SelfPageId = 7;
        }
      });

      // 处理音乐进度条
      new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type == "attributes" && mutation.attributeName == "src") {
            // 对预览进行处理
            // console.log(222);
            // $(".first-ui").text("正在获取歌词中...");
            // $(".sende-ui").text("");
            // 对音乐载入作监听
            clearInterval(timer);
            clearTimeout(timed);
            clearTimeout(timec);
            ni = 0;
            // 不好的实现,待优化
            timec = setTimeout(() => {
              audLeng = Number.parseInt(AudOb.currentTime * 1000);
              audEnd = Number.parseInt(AudOb.duration * 1000);
              step = Number.parseInt(audEnd / 1000);
              $(".LP-this").text("00:00");
              $(".LP-end").text(
                AppUtil.Parsed.timeParse(Math.floor(AudOb.duration))
              );
              timer = setInterval(() => {
                // 10ms精度
                if (!AudOb.paused) ni++;
                if (porsur) return;
                audLeng = Number.parseInt(AudOb.currentTime * 1000);
                // if(!donef){
                //   PROGELEM.setValue(ni);
                // }else{
                //   donef = false;
                //   PROGELEM.setValue(ni);
                //   setTimeout(() => donef = true,50);
                // }
                donef = true;
                PROGELEM.setValue(ni);
                donef = false;
              }, step);
              timed = setTimeout(() => {
                if (Number.isNaN(step)) {
                  clearInterval(timer);
                  audEnd = Number.parseInt(AudOb.duration * 1000);
                  step = Number.parseInt(audEnd / 1000);
                  timer = setInterval(() => {
                    if (!AudOb.paused) ni++;
                    if (porsur) return;
                    audLeng = Number.parseInt(AudOb.currentTime * 1000);
                    donef = true;
                    PROGELEM.setValue(ni);
                    donef = false;
                  }, step);
                }
              }, 5000);
            }, GroupEnum.ResetData.NOM);
          }
        });
      }).observe(AudOb, {
        attributes: true,
        attributeFilter: ["src"],
      });

      // 预加载每日30首歌曲
      AppUtil.Music.fetQQMusic(false);

      // 预加载随机网易云歌曲
      // GroupVariable.MusicList = [];
      // GroupVariable.NowMusicId = 0;
      // GroupVariable.IsInitNextM = false;
      // AppUtil.Music.fetNetMusic(AudOb, SPT, false);
      // ViewUtil.Rond.rondMList(GroupVariable.MusicList, figlMod);

      // 修正数据
      setInterval(() => {
        if (AudOb.paused) return;
        if (porsur) return;
        let leng = Number.parseInt(AudOb.currentTime * 1000);
        if (GroupVariable.isAllowLrcTimer) {
          GroupVariable.lrcTime = Number.parseInt(AudOb.currentTime * 10);
        }
        ni = Math.ceil(leng / step);
        $(".LP-end").text(AppUtil.Parsed.timeParse(Math.floor(AudOb.duration)));
        // TODO...
      }, GroupEnum.ResetData.SLW);

      // 对Audio做监听
      AudOb.addEventListener("pause", (event) => {
        GroupVariable.isAllowLrcTimer = false;
        $(".mus-kbd > img").attr("src", "icons/pause.svg");
        ViewUtil.MusicColl.roat(false);
        onPauseSong();
      });
      AudOb.addEventListener("play", (event) => {
        $(".mus-kbd > img").attr("src", "icons/play.svg");
        ViewUtil.MusicColl.roat(true);
        GroupVariable.isAllowLrcTimer = true;
        onPlaySong(GroupVariable.MusicList[GroupVariable.NowMusicId]);
      });
    });

    // 小音乐监听
    $(".mus-kbd > img,.mcc-pp > img").click(function (event) {
      if (AudOb.paused) {
        AudOb.play();
        onPlaySong(GroupVariable.MusicList[GroupVariable.NowMusicId]);
        $(".mcc-pp > img").attr("src", "icons/play.svg");
      } else {
        AudOb.pause();
        onPauseSong();
        $(".mcc-pp > img").attr("src", "icons/pause.svg");
      }
      if (event.target.className.toLowerCase() == "happy-happy-happy") {
        ViewUtil.Rond.rondMPlayer(null, AudOb);
      }
    });

    // 对屏幕旋转进行监听
    window.addEventListener("orientationchange", (event) => {
      event.stopPropagation();
      event.preventDefault();
      // 待办...
    });

    // 随机加载图片
    let uri = "url(images/starter/" + AppUtil.Random.getNumber(0, 5) + ".png)";
    $(".application-load").css("background-image", uri);
    $(".application-core").css("background-image", uri);

    // 对歌词的追踪
    setInterval(() => {
      if (GroupVariable.isAllowLrcTimer) GroupVariable.lrcTime += 1;
      let n = GroupVariable.lrcTime;
      if (GroupVariable.LrcMap.has(n)) {
        $(".first-ui").text(GroupVariable.LrcMap.get(n));
        nowLrc = LrcElement.querySelector(`.lrc${n}`);
        nowLrc.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        nowLrc.classList.add("click-lrc");
        let ca = false;
        for (let key of GroupVariable.LrcMap.keys()) {
          if (ca) {
            $(".sende-ui").text(GroupVariable.LrcMap.get(key));
            break;
          }
          if (key == n) {
            ca = true;
            continue;
          }
        }
        if (lastLrc == null) {
          lastLrc = nowLrc;
          return;
        }
        lastLrc.classList.remove("click-lrc");
        lastLrc = nowLrc;
      }
    }, 100);

    // 对时长的追踪
    setInterval(() => {
      let tim = AppUtil.Parsed.timeParse(Math.floor(AudOb.currentTime));
      $(".LP-this").text(tim);
    }, 1000);

    // 一些可以处理的任务于此
    $(".back-btn > img").click(function (event) {
      return onBackPressed();
    });
    ViewUtil.Rond.rondAboutUs();
  }
  // 横屏处理
  else {
    // 导入样式表
    importCSS("styles/mods/Transverse.css");
    document.body.addEventListener("moduleInited", (event) => {
      // TODO.
    });
    // TODO...
  }
}

// 这里对返回键进行监听
function onBackPressed() {
  // 等待资源初始化成功
  if (GroupStatic.coreInited) {
    switch (GroupVariable.SelfPageId) {
      // 对默认0进行无响应
      case 0:
        // 对向右过渡进行优化
        GroupVariable.MainSwiper.slideTo(1);
        break;
      // 左侧页面展开为一
      case 1:
        if(isRight){
          GroupVariable.MainSwiper.slideTo(2);
          isRight = false;
        }else{
          GroupVariable.MainSwiper.slideTo(1);
        }
        GroupVariable.SelfPageId = 0;
        break;
      // 未展开为2处理
      case 2:
        ViewUtil.MusicColl.MPlayer(false);
        GroupVariable.SelfPageId = 0;
        break;
      // 展开为3处理
      case 3:
        ViewUtil.MusicColl.MPlayer(false);
        GroupVariable.SelfPageId = 1;
        break;
      // 未展开为2处理
      case 4:
        $(".mpa-select").fadeOut();
        $(".mpa-define").fadeIn();
        $(".mpad-lrc").click();
        GroupVariable.SelfPageId = 2;
        break;
      // 展开为3处理
      case 5:
        $(".mpa-select").fadeOut();
        $(".mpa-define").fadeIn();
        $(".mpad-lrc").click();
        GroupVariable.SelfPageId = 3;
        break;
      // 歌词全屏
      case 6:
        $(".mpad-lrc").click();
        break;
      // 更多
      case 7:
        // 禁用优化策略
        // if(temped == 0){
        //   GroupVariable.SelfPageId = lastPageId;
        // }else{
        //   GroupVariable.SelfPageId = lastPageId;
        //   lastPageId = temped;
        //   temped = 0;
        // }
        GroupVariable.SelfPageId = lastPageId;
        layui.layer.close(GroupVariable.layerTempID);
        break;
      // 兜底处理代码
      default:
        if(($(".music-player").css("display")) == "block"){
          ViewUtil.MusicColl.MPlayer(false);
        }
        GroupVariable.MainSwiper.slideTo(1);
        GroupVariable.SelfPageId = 0;
        break;
    }
    // 待办...
  }
}

// 更新通知栏
function updateMusicNotification(songInfo) {
  if (window.AndroidMusicBridge) {
    AndroidMusicBridge.updateMusicInfo({
      title: songInfo.song,
      artist: songInfo.singer,
      album: songInfo.album || "",
      artwork: songInfo.img || "",
      isPlaying: AudOb.paused,
    });
  }
  ViewUtil.Rond.rondMPlayer(null, AudOb);
}

// 播放音乐时调用
function onPlaySong(song) {
  if (song == undefined) return;
  updateMusicNotification({
    song: song.song,
    singer: song.singer,
    img: song.img,
    isPlaying: AudOb.paused,
  });
  ViewUtil.Rond.rondMPlayer(null, AudOb);
}

// 暂停时调用
function onPauseSong() {
  if (window.AndroidMusicBridge) {
    AndroidMusicBridge.setPlaybackState(AudOb.paused);
    ViewUtil.Rond.rondMPlayer(null, AudOb);
  }
}

// 停止时调用
function onStopSong() {
  if (window.AndroidMusicBridge) {
    AndroidMusicBridge.hideNotification();
  }
}

// 接收来自Android的通知栏按钮事件
function onNotificationPlay() {
  // 实现播放逻辑
  AudOb.pause();
  AndroidMusicBridge.setPlaybackState(AudOb.paused);
  ViewUtil.Rond.rondMPlayer(null, AudOb);
}

function onNotificationPause() {
  // 实现暂停逻辑
  AudOb.play();
  AndroidMusicBridge.setPlaybackState(AudOb.paused);
  ViewUtil.Rond.rondMPlayer(null, AudOb);
}

function onNotificationNext() {
  // 实现下一首逻辑
  $(".mcc-down > img").click();
}

function onNotificationPrevious() {
  // 实现上一首逻辑
  $(".mcc-up > img").click();
}

function onNotificationStop() {
  // 实现停止逻辑
  // NOTHING...
}

$(main);
