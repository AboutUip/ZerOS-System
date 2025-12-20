// 本文件存放各种全局通用函数或者方法
// 只有具有极高抽象性的才可以存放在此
// 个别与页面紧密相连的方法函数
// 可以存放在view.js中(这个文件用于分类管理页面通用函数)
const AppUtil = {};
// 对随机数的扩展
AppUtil.Random = {
  // 该方法返回一个[min,max]内的随机整数
  getNumber: function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  // 该方法返回一个随机布尔值
  getBool: function () {
    let val = this.getNumber(0, 1);
    if (val == 0) return false;
    return true;
  },
};
// 选择
AppUtil.Select = {
  // 下一首
  slem: function (audio, swiper, type) {
    // 初始化
    GroupVariable.atLosterLrc = "";
    if (GroupVariable.NowMusicId < 0) {
      GroupVariable.NowMusicId++;
      if (type == GroupEnum.ModEnum.RANDOM_NETMUSIC) {
        AppUtil.Music.fetNetMusic(audio, swiper);
        ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
      } else if (type == GroupEnum.ModEnum.SLEEP_MUSIC) {
        AppUtil.Music.fetSleepMusic(audio, swiper);
        ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
      } else if (type == GroupEnum.ModEnum.NOTICE_MUSIC) {
        AppUtil.Music.fetNoticeMusic(audio, swiper);
        ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
      } else {
        // NOTHING...
      }
      return;
    }
    // 优先判断是不是喜欢的歌曲
    if(type == GroupEnum.ModEnum.LIKE_MUSIC){
      let musicID = ($(".mpadc-song > p").text()) + ($(".mpadc-sing > p").text());
      let isNext = false;
      let n = 0;
      for (const valueID of Object.keys(GroupVariable.likeListColl)) {
        if(GroupVariable.likeListColl[valueID] == null) continue;
        if(isNext){
          GroupVariable.NowMusicId = n;
          let data = GroupVariable.likeListColl[valueID];
          AppUtil.Parsed.parseLikeData(audio,data);
          return;
        }
        if(valueID == musicID) isNext = true;
        n++;
      }
      n = 0;
      for (const val of Object.values(GroupVariable.likeListColl)) {
        if(val == null){
          n++;
          continue;
        }
        GroupVariable.NowMusicId = n;
        AppUtil.Parsed.parseLikeData(audio,val);
      }
      return true;
    }
    // 使用列表
    // 判断是否到达末尾并且持有缓存
    if (
      GroupVariable.NowMusicId == GroupVariable.MusicList.length - 1 &&
      GroupVariable.NextMusicData != null &&
      GroupVariable.IsInitNextM
    ) {
      let data = GroupVariable.NextMusicData;
      let idf = GroupVariable.NowMusicId;
      switch (type) {
        case GroupEnum.ModEnum.RANDOM_NETMUSIC:
          audio.src = data.url;
          audio.play();
          fetch(
            `https://api.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${data.song} ${data.singer}&num=20&br=2&n=1`
          )
            .then((response) => {
              idf++;
              return response.json();
            })
            .then((data) => {
              GroupVariable.MusicList[idf].lrc = data.data.lrc;
              AppUtil.Parsed.LrcData(data.data.lrc);
            })
            .catch((e) => {
              console.log(e);
              mui.toast(e.toString());
            });
          ViewUtil.MusicColl.updataSM(data.song, data.img, audio, data.singer);
          ViewUtil.Rond.rondSName(data.song, null, data.singer);
          AppUtil.Music.getNetMusicData().then((data) => {
            // 处理缓存
            GroupVariable.NextMusicData = data;
            GroupVariable.IsInitNextM = true;
            ViewUtil.Rond.rondSName(null, data.song);
          });
          break;
        case GroupEnum.ModEnum.SLEEP_MUSIC:
          audio.src = data.url;
          audio.play();
          ViewUtil.MusicColl.updataSM(
            data.title,
            data.cover,
            audio,
            data.nickname
          );
          ViewUtil.Rond.rondSName(data.title, null, data.nickname);
          AppUtil.Music.getSleepData().then((data) => {
            // 处理缓存
            GroupVariable.NextMusicData = data;
            GroupVariable.IsInitNextM = true;
            ViewUtil.Rond.rondSName(null, data.title);
          });
          break;
        case GroupEnum.ModEnum.NOTICE_MUSIC:
          audio.src = data.url;
          audio.play();
          ViewUtil.MusicColl.updataSM(
            data.title,
            data.cover,
            audio,
            data.nickname
          );
          ViewUtil.Rond.rondSName(data.title, null, data.nickname);
          AppUtil.Music.getNoticeMusic().then((data) => {
            // 处理缓存
            GroupVariable.NextMusicData = data;
            GroupVariable.IsInitNextM = true;
            ViewUtil.Rond.rondSName(null, data.title);
          });
          break;
      }
      GroupVariable.MusicList.push(data);
      GroupVariable.NowMusicId++;
      GroupVariable.NextMusicData = null;
      GroupVariable.IsInitNextM = false;
      ViewUtil.MusicColl.roat(true);
      ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
      return;
    }

    // 判断是否在列表中间
    if (
      GroupVariable.MusicList.length - 1 != GroupVariable.NowMusicId &&
      GroupVariable.MusicList.length != 0
    ) {
      GroupVariable.NowMusicId++;
      let data = GroupVariable.MusicList[GroupVariable.NowMusicId];
      switch (type) {
        case GroupEnum.ModEnum.RANDOM_NETMUSIC:
          audio.src = data.url;
          audio.play();
          ViewUtil.MusicColl.updataSM(data.song, data.img, audio, data.singer);
          ViewUtil.Rond.rondSName(
            data.song,
            GroupVariable.MusicList[GroupVariable.NowMusicId + 1].song,
            data.singer
          );
          break;
        case GroupEnum.ModEnum.SLEEP_MUSIC:
        case GroupEnum.ModEnum.NOTICE_MUSIC:
          audio.src = data.url;
          audio.play();
          ViewUtil.MusicColl.updataSM(
            data.title,
            data.cover,
            audio,
            data.nickname
          );
          ViewUtil.Rond.rondSName(
            data.title,
            GroupVariable.MusicList[GroupVariable.NowMusicId + 1].title,
            data.nickname
          );
          break;
      }
      // 歌词处理
      if (data.hasOwnProperty("lrc")) {
        AppUtil.Parsed.LrcData(data.lrc);
      } else if (type == GroupEnum.ModEnum.QQ_MUSIC) {
        let idf = GroupVariable.NowMusicId;
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
      } else {
        // NOTHING...
      }
      ViewUtil.MusicColl.roat(true);
      return true;
    }

    // 正常请求
    GroupVariable.NowMusicId++;
    if (type == GroupEnum.ModEnum.RANDOM_NETMUSIC) {
      AppUtil.Music.fetNetMusic(audio, swiper);
      ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
    } else if (type == GroupEnum.ModEnum.SLEEP_MUSIC) {
      AppUtil.Music.fetSleepMusic(audio, swiper);
      ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
    } else if (type == GroupEnum.ModEnum.SEARCH_LIST) {
      // 搜索到达请求
      if (GroupVariable.NowMusicId == GroupVariable.SearchDataTemp) {
        GroupVariable.NowMusicId = 0;
        AppUtil.Music.updateNetGet(
          1,
          GroupVariable.tempSear,
          GroupVariable.AudOb,
          false
        );
        return;
      }
      AppUtil.Music.updateNetGet(
        GroupVariable.NowMusicId + 1,
        GroupVariable.tempSear,
        GroupVariable.AudOb,
        false
      );
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
      ViewUtil.Rond.rondMList(datas, type);
      GroupVariable.PlayListSwiper.slideTo(GroupVariable.NowMusicId, 1);
    } else if (type == GroupEnum.ModEnum.QQ_MUSIC) {
      // QQ音乐到达末尾处理程序
      GroupVariable.NowMusicId = 0;
      let data = GroupVariable.MusicList[0];
      audio.src = data.url;
      audio.play();
      if (data.hasOwnProperty("lrc")) {
        AppUtil.Parsed.LrcData(data.lrc);
      } else {
        fetch(
          `https://www.hhlqilongzhu.cn/api/dg_geci.php?msg=${data.song} ${data.singer}&type=2&n=1`
        )
          .then((response) => response.text())
          .then((lrc) => {
            GroupVariable.QQMusicData[0].lrc = lrc;
            AppUtil.Parsed.LrcData(lrc);
          })
          .catch((e) => {
            console.log(e);
            mui.toast(e.toString());
          });
      }
      ViewUtil.MusicColl.updataSM(data.song, data.img, audio, data.singer);
      ViewUtil.MusicColl.roat(true);
      ViewUtil.Rond.rondSName(
        data.song,
        GroupVariable.MusicList[GroupVariable.NowMusicId + 1].song,
        data.singer
      );
    } else {
      AppUtil.Music.fetNoticeMusic(audio, swiper);
      ViewUtil.Rond.rondMList(GroupVariable.MusicList, type);
    }
    return true;
  },
  // 上一首
  priv: function (audio, swiper, type) {
    GroupVariable.atLosterLrc = "";
    if (GroupVariable.NowMusicId < 0) return;
    let data = null;
    if (
      GroupVariable.NowMusicId == 0 &&
      type != GroupEnum.ModEnum.SEARCH_LIST
    ) {
      GroupVariable.NowMusicId = GroupVariable.MusicList.length;
    } else if (type == GroupEnum.ModEnum.SEARCH_LIST) {
      // 单独处理搜索
      if (GroupVariable.NowMusicId == 0) {
        AppUtil.Music.updateNetGet(
          GroupVariable.SearchDataTemp,
          GroupVariable.tempSear,
          GroupVariable.AudOb
        );
        return;
      }
      AppUtil.Music.updateNetGet(
        GroupVariable.NowMusicId,
        GroupVariable.tempSear,
        GroupVariable.AudOb,
        false
      );
      GroupVariable.NowMusicId--;
      return;
    } else if (type == GroupEnum.ModEnum.RANDOM_NETMUSIC) {
      GroupVariable.NowMusicId--;
      data = GroupVariable.MusicList[GroupVariable.NowMusicId];
      audio.src = data.url;
      audio.play();
      ViewUtil.Rond.rondSName(
        data.song,
        GroupVariable.MusicList[GroupVariable.NowMusicId + 1].song,
        data.singer
      );
      ViewUtil.MusicColl.updataSM(data.song, data.img, audio, data.singer);
    } else if(type == GroupEnum.ModEnum.LIKE_MUSIC){
      // 处理喜欢的歌单
      let musicID = ($(".mpadc-song > p").text()) + ($(".mpadc-sing > p").text());
      let data = null;
      for (const valueID of Object.keys(GroupVariable.likeListColl)) {
        if(GroupVariable.likeListColl[valueID] == null) continue;
        if(musicID == valueID){
          if(data == null){
            // 说明到达了第一首歌曲
            break;
          }
          AppUtil.Parsed.parseLikeData(audio,data);
          return;
        }
        data = GroupVariable.likeListColl[valueID];
      }
      data = Object.values(GroupVariable.likeListColl);
      let len = data.length - 1;
      for(len;len >= 0;len--){
        if(data[len] == null) continue;
        AppUtil.Parsed.parseLikeData(audio,data[len]);
        break;
      }
      return;
    }else{
      GroupVariable.NowMusicId--;
      data = GroupVariable.MusicList[GroupVariable.NowMusicId];
      audio.src = data.url;
      audio.play();
      ViewUtil.Rond.rondSName(
        data.title,
        GroupVariable.MusicList[GroupVariable.NowMusicId + 1].title,
        data.nickname
      );
      ViewUtil.MusicColl.updataSM(data.title, data.cover, audio, data.nickname);
    }
    if (data.hasOwnProperty("lrc")) AppUtil.Parsed.LrcData(data.lrc);
    ViewUtil.MusicColl.roat(true);
  },
};
// 对音乐播放的更新
AppUtil.Music = {
  // 请求热门搜索
  upHotSearch() {
    fetch("https://kw-api.cenguigui.cn?type=searchKey")
      .then((response) => response.json())
      .then((data) => {
        GroupVariable.hotSearchData = data.data.hots;
      })
      .catch((e) => {
        console.log(e);
        mui.toast(e.toString());
      });
  },
  // WIFI GET UPDATE
  updateNetGet(n, tempSear, audio, needAuto = true) {
    let mus_url;
    let url;
    if (needAuto) {
      GroupVariable.NowMusicId = n - 1;
    }
    // 已解析
    if (GroupVariable.saveParseData[n - 1] != null) {
      let data = GroupVariable.saveParseData[n - 1];
      GroupVariable.IsInitNextM = false;
      if (
        GroupVariable.searchMod == GroupEnum.SearchMod.NetEasyMusic ||
        GroupVariable.searchMod == GroupEnum.SearchMod.KuwoMusic
      ) {
        mus_url = data.music_url;
      } else {
        mus_url = data.music;
      }
      audio.src = mus_url;
      audio.play();
      if (data.hasOwnProperty("lrc")) {
        if (data.hasOwnProperty("lrced")) {
          if (!data.lrced) {
            fetch(data.lrc)
              .then((response) => response.json())
              .then((dataed) => {
                let lrcdata = dataed.data.lrclist;
                GroupVariable.saveParseData[n - 1].lrc = lrcdata;
                GroupVariable.saveParseData[n - 1].lrced = true;
                ViewUtil.MusicColl.updataSM(
                  data.title,
                  data.cover,
                  audio,
                  data.singer
                );
                ViewUtil.MusicColl.roat(true);
                AppUtil.Parsed.LrcData(lrcdata);
              })
              .catch((e) => {
                mui.toast(e.toString());
                console.log(e);
                GroupVariable.saveParseData[n - 1].lrced = false;
              });
            return true;
          }
        }
        AppUtil.Parsed.LrcData(data.lrc);
      }
      ViewUtil.MusicColl.updataSM(data.title, data.cover, audio, data.singer);
      ViewUtil.MusicColl.roat(true);
      return;
    }
    if (GroupVariable.searchMod == GroupEnum.SearchMod.NetEasyMusic) {
      url = `https://api.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${tempSear}&num=30&br=2&n=${n}`;
    } else {
      url = `https://api.cenguigui.cn/api/qishui/app/?action=song&id=${GroupVariable.searchTemp[n].id}`;
    }
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (data.code != 200){
          layui.layer.close(lid);
          return;
        }
        data = data.data;
        if(GroupVariable.searchMod == GroupEnum.SearchMod.QiShuiMusic){
          data = {
            title : data.name,
            singer : data.artists,
            music : data.url,
            cover : data.pic,
            lrc : data.lyric
          };
        }
        GroupVariable.saveParseData[n - 1] = data;
        GroupVariable.IsInitNextM = false;
        AppUtil.Parsed.LrcData(data.lrc);
        if (GroupVariable.searchMod == GroupEnum.SearchMod.NetEasyMusic) {
          mus_url = data.music_url;
        } else {
          mus_url = data.music;
        }
        audio.src = mus_url;
        audio.play();
        ViewUtil.MusicColl.updataSM(data.title, data.cover, audio, data.singer);
        ViewUtil.MusicColl.roat(true);
        layui.layer.close(lid);
      })
      .catch((e) => {
        console.log(e);
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 仅获取网易云歌曲数据
  getNetMusicData() {
    return fetch("https://www.hhlqilongzhu.cn/api/wangyi_hot_review.php", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        return data;
      })
      .catch((e) => {
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 仅获得随机语录故事
  getNoticeMusic() {
    return fetch("https://api.cenguigui.cn/api/music/ximalaya_gushi.php", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        return data;
      })
      .catch((e) => {
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 仅获得助眠歌曲数据
  getSleepData() {
    return fetch("https://api.cenguigui.cn/api/music/ximalaya_gangqin.php", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        return data;
      })
      .catch((e) => {
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 随机网易云歌曲
  fetNetMusic: async function (audio, swiper, loaded = true) {
    let lid;
    if (loaded) {
      lid = layui.layer.load(1, {
        shade: 0.6,
      });
    }
    this.getNetMusicData()
      .then(async (data) => {
        let da = await fetch(
          `https://api.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${data.song} ${data.singer}&num=20&br=2&n=1`
        );
        da = await da.json();
        data.lrc = da.data.lrc;
        GroupVariable.MusicList.push(data);
        audio.src = data.url;
        if (loaded) {
          audio.play();
          ViewUtil.MusicColl.roat(true);
        } else {
          audio.pause();
          ViewUtil.MusicColl.roat(false);
        }
        AppUtil.Parsed.LrcData(da.data.lrc);
        ViewUtil.MusicColl.updataSM(data.song, data.img, audio, data.singer);
        ViewUtil.Rond.rondSName(data.song, null, data.singer);
        ViewUtil.Rond.rondMList(
          GroupVariable.MusicList,
          GroupEnum.ModEnum.RANDOM_NETMUSIC
        );
        layui.layer.close(lid);
        return data;
      })
      .catch((e) => {
        layui.layer.close(lid);
        mui.toast(e.toString());
        console.log(e);
      });
    this.getNetMusicData().then((data) => {
      GroupVariable.NextMusicData = data;
      GroupVariable.IsInitNextM = true;
      ViewUtil.Rond.rondSName(null, data.song);
    });
  },
  // 助眠钢琴曲
  fetSleepMusic(audio, swiper) {
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    this.getSleepData().then((data) => {
      GroupVariable.MusicList.push(data);
      audio.src = data.url;
      audio.play();
      ViewUtil.MusicColl.updataSM(data.title, data.cover, audio, data.nickname);
      ViewUtil.MusicColl.roat(true);
      layui.layer.close(lid);
      ViewUtil.Rond.rondSName(data.title, null, data.nickname);
      ViewUtil.Rond.rondMList(
        GroupVariable.MusicList,
        GroupEnum.ModEnum.SLEEP_MUSIC
      );
      return data;
    });
    this.getSleepData().then((data) => {
      GroupVariable.IsInitNextM = true;
      GroupVariable.NextMusicData = data;
      ViewUtil.Rond.rondSName(null, data.title);
    });
  },
  // 随机语录
  fetNoticeMusic(audio, swiper) {
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    this.getNoticeMusic().then((data) => {
      GroupVariable.MusicList.push(data);
      audio.src = data.url;
      audio.play();
      ViewUtil.MusicColl.updataSM(data.title, data.cover, audio, data.nickname);
      ViewUtil.MusicColl.roat(true);
      layui.layer.close(lid);
      ViewUtil.Rond.rondSName(data.title, null, data.nickname);
      ViewUtil.Rond.rondMList(
        GroupVariable.MusicList,
        GroupEnum.ModEnum.NOTICE_MUSIC
      );
      return data;
    });
    this.getNoticeMusic().then((data) => {
      GroupVariable.IsInitNextM = true;
      GroupVariable.NextMusicData = data;
      ViewUtil.Rond.rondSName(null, data.title);
    });
  },
  // QQ音乐
  fetQQMusic(isdt = true) {
    let lid;
    if (isdt) {
      lid = layui.layer.load(1, {
        shade: 0.6,
      });
    }
    fetch("https://api.cenguigui.cn/api/qq/music/Daily30.php", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (GroupVariable.QQMusicData != null) {
          layui.layer.close(lid);
          return true;
        }
        let dd = data.data.songlist;
        let arr = new Array();
        dd.forEach((val, ind) => {
          $(".qqm-coll").append(`
            <div class="qq-music-coll" data-qurl='${val.url}' data-n='${ind}'>
              <img src="${val.pic}">
              <span>${val.name}</span>
              <p>${val.author}</p>
            </div>
          `);
          arr.push({
            img: val.pic,
            url: val.url,
            song: val.name,
            singer: val.author,
          });
        });
        GroupVariable.QQMusicData = arr;
        layui.layer.close(lid);
      })
      .catch((e) => {
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },

  // 是否喜欢
  isLikeOf(music_id) {
    if (GroupVariable.likeListColl.hasOwnProperty(music_id)) {
      if (GroupVariable.likeListColl[music_id] != null) {
        return true;
      }
    }
    return false;
  },
};
// 对搜索歌曲的检索
AppUtil.SraechOf = {
  // 网易云
  NetMusic(songtext) {
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    fetch(
      `https://api.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${songtext}&num=30&br=2`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      }
    )
      .then((response) => response.json())
      .then((data) => {
        let cdata = data.data;
        GroupVariable.searchTemp = cdata;
        ViewUtil.Rond.rondArray(cdata);
        GroupVariable.SearchDataTemp = cdata.length;
        GroupVariable.saveParseData = new Array(cdata.length);
        GroupVariable.saveParseData.fill(null);
        layui.layer.close(lid);
      })
      .catch((e) => {
        console.log(e);
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 酷我
  KWMusic(songtext) {
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    fetch(`https://kw-api.cenguigui.cn?name=${songtext}&page=1&limit=30`)
      .then((response) => response.json())
      .then((data) => {
        let cdata = data.data;
        GroupVariable.SearchDataTemp = cdata.length;
        ViewUtil.Rond.rondArray(cdata);
        let arrparse = [];
        cdata.forEach((value, index) => {
          arrparse.push({
            title: value.name,
            singer: value.artist,
            cover: value.pic,
            music_url: value.url,
            lrc: value.lrc,
            lrced: false,
          });
        });
        GroupVariable.searchTemp = arrparse;
        GroupVariable.saveParseData = arrparse;
        layui.layer.close(lid);
      })
      .catch((e) => {
        console.log(e);
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
  // 汽水
  QSMusic(tempSear) {
    let lid = layui.layer.load(1, {
      shade: 0.6,
    });
    fetch(`http://api.cenguigui.cn/api/qishui/?msg=${tempSear}&type=json`)
      .then((response) => response.json())
      .then((data) => {
        let cdata = data.data;
        let tempArrayOfCD = [];
        cdata.forEach((val,ind,self) => {
          tempArrayOfCD.push({
            n : (ind + 1),
            title : val.title,
            singer : val.singer,
            // cover : val.cover,
            id : val.track_id,
          });
        });
        GroupVariable.searchTemp = tempArrayOfCD;
        ViewUtil.Rond.rondArray(tempArrayOfCD);
        GroupVariable.SearchDataTemp = cdata.length;
        GroupVariable.saveParseData = new Array(cdata.length);
        GroupVariable.saveParseData.fill(null);
        layui.layer.close(lid);
      })
      .catch((e) => {
        console.log(e);
        mui.toast(e.toString());
        layui.layer.close(lid);
      });
  },
};
// 解析相关
AppUtil.Parsed = {
  // 解析歌词
  LrcData(lrc) {
    GroupVariable.LrcMap.clear();
    if (lrc == undefined || lrc == null) {
      GroupVariable.LrcMap.set(15, "该歌曲可能没有适配的歌词");
      ViewUtil.Rond.rondLRC(GroupVariable.LrcMap);
      return false;
    }
    GroupVariable.atLosterLrc = lrc;
    let data = lrc.split(`\n`);
    let key, value, time, tem;
    data.forEach((val, ind) => {
      try {
        tem = val.indexOf("]");
        key = val.substring(1, tem);
        value = val.substring(tem + 1, 99999999);
        tem = key.indexOf(":");
        time = Number.parseInt(key.substring(0, tem)) * 60 * 1000;
        key = Number.parseFloat(key.substring(tem + 1, 999999)) * 1000;
        key = Number.parseInt((time + key) / 100);
        if (Number.isNaN(key)) return false;
        GroupVariable.LrcMap.set(key, value);
      } catch (e) {
        return false;
      }
    });
    ViewUtil.Rond.rondLRC(GroupVariable.LrcMap);
  },
  // 解析时长
  timeParse(time) {
    let min = Math.floor(time / 60);
    let sec = time % 60;
    if (min < 10) {
      min = "0" + min;
    }
    if (sec < 10) {
      sec = "0" + sec;
    }
    return "" + min + ":" + ("" + sec);
  },
  // 解析music_id
  parseMusicId(type, searchMod) {
    // 注意,该方法依赖GroupVariable.MusicList[NowMusicId]的实时性
    let music_id;
    let data;
    let name;
    let pic;
    if (type == GroupEnum.ModEnum.SEARCH_LIST) {
      // 搜索歌曲由其他依赖项进行测试
      data = GroupVariable.saveParseData[GroupVariable.NowMusicId];
      name = data["title"];
      music_id = name + data["singer"];
      pic = data["cover"];
    } else {
      // 随机网易云和QQ音乐可用
      data = GroupVariable.MusicList[GroupVariable.NowMusicId];
      name = data["song"];
      music_id = name + data["singer"];
      pic = data["img"];
    }
    return {
      // 音乐id
      music_id: music_id,
      // 独立id
      music_lid : 0,
      // 歌名
      music_name: name,
      // 歌手
      music_singer: data["singer"],
      // 搜索类型
      music_type: type,
      // 可能的类型
      music_searchType: searchMod,
      // 歌词
      music_lrc: "[00:10.000]暂未获取到歌词...",
      // 封面
      music_pic: pic,
      // 音频
      music_url: null,
      // 是否已初始化
      music_init: false,
    };
  },
  // 解析喜欢的音乐
  parseLikeData(audio, data) {
    if (data.music_init) {
      // 已初始化音乐
      audio.src = data.music_url;
      audio.play();
      AppUtil.Parsed.LrcData(data.music_lrc);
      ViewUtil.MusicColl.updataSM(
        data.music_name,
        data.music_pic,
        audio,
        data.music_singer
      );
      ViewUtil.MusicColl.roat(true);
      ViewUtil.Rond.rondMPlayer(null, audio);
    } else {
      // 未初始化音乐
      let lid = layui.layer.load(1, {
        shade: 0.6,
      });
      let type_request = data.music_type;
      let type_search = data.music_searchType;
      if (
        type_request == GroupEnum.ModEnum.RANDOM_NETMUSIC ||
        type_search == GroupEnum.SearchMod.NetEasyMusic
      ) {
        // 网易云请求
        fetch(
          `https://api.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${data.music_id}&num=30&br=2&n=1`
        )
          .then((response) => response.json())
          .then((datae) => {
            datae = datae.data;
            GroupVariable.likeListColl[data.music_id].music_pic =
              datae.cover;
            GroupVariable.likeListColl[data.music_id].music_url =
              datae.music_url;
            GroupVariable.likeListColl[data.music_id].music_lrc =
              datae.lrc;
            GroupVariable.likeListColl[
              data.music_id
            ].music_init = true;
            data = GroupVariable.likeListColl[data.music_id];
            audio.src = data.music_url;
            audio.play();
            AppUtil.Parsed.LrcData(data.music_lrc);
            ViewUtil.MusicColl.updataSM(
              data.music_name,
              data.music_pic,
              audio,
              data.music_singer
            );
            ViewUtil.MusicColl.roat(true);
            ViewUtil.Rond.rondMPlayer(null, audio);
            GroupVariable.IsInitNextM = false;
            layui.layer.close(lid);
          })
          .catch((e) => {
            console.log(e);
            mui.toast(e.toString());
            layui.layer.close(lid);
          });
      } else if (type_request == GroupEnum.ModEnum.QQ_MUSIC) {
        // QQ音乐请求
        // 不可能到达
        // 现版本不会支持QQ音乐收藏功能
        // TODO...
      } else if (
        type_request == GroupEnum.ModEnum.SEARCH_LIST ||
        type_search == GroupEnum.SearchMod.QiShuiMusic
      ) {
        // 汽水音乐请求
        fetch(`https://api.cenguigui.cn/api/qishui/app/?action=song&id=${data.music_lid}`)
          .then((response) => response.json())
          .then((datae) => {
            datae = datae.data;
            GroupVariable.likeListColl[data.music_id].music_pic =
              datae.pic;
            GroupVariable.likeListColl[data.music_id].music_url =
              datae.url;
            GroupVariable.likeListColl[data.music_id].music_lrc =
              datae.lyric;
            GroupVariable.likeListColl[
              data.music_id
            ].music_init = true;
            data = GroupVariable.likeListColl[data.music_id];
            audio.src = data.music_url;
            audio.play();
            AppUtil.Parsed.LrcData(data.music_lrc);
            ViewUtil.MusicColl.updataSM(
              data.music_name,
              data.music_pic,
              audio,
              data.music_singer
            );
            ViewUtil.MusicColl.roat(true);
            ViewUtil.Rond.rondMPlayer(null, audio);
            GroupVariable.IsInitNextM = false;
            layui.layer.close(lid);
          })
          .catch((e) => {
            console.log(e);
            mui.toast(e.toString());
            layui.layer.close(lid);
          });
      } else {
        // 酷我音乐请求
        fetch(`https://kw-api.cenguigui.cn?name=${data.music_id}&page=1&limit=30`)
          .then((response) => response.json())
          .then((data) => {
            data = data.data[0];
            GroupVariable.likeListColl[data.music_id].music_pic =
              datae.pic;
            GroupVariable.likeListColl[data.music_id].music_url =
              datae.url;
            GroupVariable.likeListColl[data.music_id].music_lrc =
              datae.lrc;
            GroupVariable.likeListColl[
              data.music_id
            ].music_init = true;
            data = GroupVariable.likeListColl[data.music_id];
            audio.src = data.music_url;
            audio.play();
            AppUtil.Parsed.LrcData(data.music_lrc);
            ViewUtil.MusicColl.updataSM(
              data.music_name,
              data.music_pic,
              audio,
              data.music_singer
            );
            ViewUtil.MusicColl.roat(true);
            ViewUtil.Rond.rondMPlayer(null, audio);
            GroupVariable.IsInitNextM = false;
            layui.layer.close(lid);
          })
          .catch((e) => {
            console.log(e);
            mui.toast(e.toString());
            layui.layer.close(lid);
          });
        // TODO...
      }
    }
  },
};

// 设置管理
AppUtil.Setting = {
  // 自有属性
  __SETTING__: null,
  __NAME__: "",
  // 初始化
  init(name) {
    if (this.__SETTING__ != null) {
      this.__NAME__ = name;
      return false;
    }
    this.__SETTING__ = layui.data(name);
    this.__NAME__ = name;
  },
  // 获取项
  getItem(item) {
    return this.__SETTING__[item];
  },
  // 增加项
  setItem(item, val) {
    layui.data(this.__NAME__, {
      key: item,
      value: val,
    });
    this.__SETTING__ = layui.data(this.__NAME__);
  },
};
