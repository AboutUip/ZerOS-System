// 这里用于编写与页面紧密相连的扩展函数
const ViewUtil = {};
// 该方法可以更新导航栏
ViewUtil.NavTouch = {
  // 切换页面
  changPage: function (swiper) {
    $(".nav-core").fadeIn();
    $(".music-coll").css("width", "75%");
    $("#tarr").css("width", "200px");
    let index = swiper.activeIndex;
    if (index == 1) {
      swiper.allowSlidePrev = false;
      swiper.allowSlideNext = true;
    } else if(index == 2){
      swiper.allowSlideNext = false;
      swiper.allowSlidePrev = true;
    } else {
      swiper.allowSlidePrev = true;
      swiper.allowSlideNext = true;
    }
    swiper.slideTo(index);
    if (index == 1) {
      $(".ico-mod > img").attr("src", "images/icon/cli-mod.svg");
      $(".ico-user > img").attr("src", "images/icon/uns-user.svg");
    } else if (index == 2) {
      $(".ico-mod > img").attr("src", "images/icon/uns-mod.svg");
      $(".ico-user > img").attr("src", "images/icon/cli-user.svg");
    } else {
      $(".nav-core").fadeOut(150);
      $(".music-coll").css("width", "100%");
      $("#tarr").css("width", "350px");
    }
  },
};
// 对音乐播放容器的更新
ViewUtil.MusicColl = {
  // 依赖用flag
  isAnimeing: false,
  // 更新小音乐
  updataSM: function (name, img, audio, sing) {
    if(audio.paused){
      $(".mus-kbd > img").attr("src", "icons/pause.svg");
    }else{
      $(".mus-kbd > img").attr("src", "icons/play.svg");
    }
    $(".mus-img > img").attr("src", img);
    $(".mus-name").text(name);
    $(".mpadc-song > p").text(name);
    $(".mpadc-sing > p").text(sing);
    // 更新喜欢与否
    if(AppUtil.Music.isLikeOf((name + sing))){
      // 喜欢
      GroupVariable.likeMusicOfThis = true;
      ViewUtil.Rond.rondLikeIcon(true);
    }else{
      // 不喜欢
      GroupVariable.likeMusicOfThis = false;
      ViewUtil.Rond.rondLikeIcon(false);
    }
    // 更新通知栏
    updateMusicNotification({
      song : name,
      singer : sing,
      img : img,
      album : '小萱baibai'
    });
    ViewUtil.Rond.rondMPlayer(img, audio);
  },
  // 旋转
  roat: function (played) {
    if (played) {
      $(".mus-img").css("animation-play-state", "running");
    } else {
      $(".mus-img").css("animation-play-state", "paused");
    }
  },
  // 展开音乐播放器
  MPlayer(isopen) {
    if (isopen) {
      if (this.isAnimeing) return;
      this.isAnimeing = true;
      $(".music-player").css("display", "block");
      $(".music-player").addClass("animate__fadeInUpBig");
      $(".application-core").addClass("animate__fadeOutUpBig");
      $(".music-player").removeClass("animate__fadeOutDownBig");
      $(".application-core").removeClass("animate__fadeInDown");
      setTimeout(function () {
        $(".application-core").css("display", "none");
        ViewUtil.MusicColl.isAnimeing = false;
      }, 400);
    } else {
      if (this.isAnimeing) return;
      this.isAnimeing = true;
      $(".application-core").css("display", "block");
      $(".application-core").removeClass("animate__fadeOutUpBig");
      $(".music-player").removeClass("animate__fadeInUpBig");
      $(".music-player").addClass("animate__fadeOutDownBig");
      $(".application-core").addClass("animate__fadeInDown");
      setTimeout(function () {
        // 对向右过渡进行优化
        if(GroupVariable.MainSwiper.activeIndex == 2){
          GroupVariable.MainSwiper.allowSlideNext = false;
        }else{
          GroupVariable.MainSwiper.allowSlideNext = true;
        }
        $(".music-player").css("display", "none");
        ViewUtil.MusicColl.isAnimeing = false;
      }, 400);
    }
  },
};
// 渲染数据
ViewUtil.Rond = {
  // 渲染列表数据
  rondArray(cdata) {
    $(".sear-list-coll").html("");
    if(GroupVariable.searchMod == GroupEnum.SearchMod.KuwoMusic){
      let n = 1;
      cdata.forEach((value) => {
        $(".sear-list-coll").append(`
          <div class="music-coller" data-n="${n}">
            <span>${value.name}</span>
            <p>${value.artist}</p>
          </div>
        `);
        n++;
      });
    }else if(GroupVariable.searchMod == GroupEnum.SearchMod.QiShuiMusic){
      cdata.forEach((value) => {
        $(".sear-list-coll").append(`
          <div class="music-coller" data-n="${value.n}" data-id="${value.id}">
            <span>${value.title}</span>
            <p>${value.singer}</p>
          </div>
        `);
      });
    }else{
      cdata.forEach((value) => {
        $(".sear-list-coll").append(`
          <div class="music-coller" data-n="${value.n}">
            <span>${value.title}</span>
            <p>${value.singer}</p>
          </div>
        `);
      });
    }
  },
  // 渲染热门搜索
  rondHotSearch(){
    $(".sear-list-coll").html("");
    if(GroupVariable.hotSearchData != null){
      let dataTemp = GroupVariable.hotSearchData;
      $('.sear-list-coll').append(`
        <div class='slcb'>
          <h1>热门搜索</h1>
          <hr>
        </div>
      `);
      for (const value of dataTemp) {
        $('.sear-list-coll > .slcb').append(`
          <p class='slc-data' data-fmid='${value.name}'>${value.name}</p>
        `);
      }
    }else{
      AppUtil.Music.upHotSearch();
    }
  },
  // 歌名渲染切换
  rondSName(now, next, sing) {
    let last = GroupVariable.NowMusicId;
    if (last < 0 || GroupVariable.MusicList[last - 1] == undefined) {
      return;
    }
    if (now != null) $(".mpadc-song > p").text(now);
    if (sing) $(".mpadc-sing > p").text(sing);
    last = GroupVariable.MusicList[last - 1].song;
    switch (GroupVariable.PlayIndex) {
      case 0:
        if (now != null) $(".n0").text(now);
        $(".n2").text(last);
        if (next != null) $(".n1").text(next);
        break;
      case 1:
        if (now != null) $(".n1").text(now);
        $(".n0").text(last);
        if (next != null) $(".n2").text(next);
        break;
      case 2:
        if (now != null) $(".n2").text(now);
        $(".n1").text(last);
        if (next != null) $(".n0").text(next);
        break;
    }
  },
  // 渲染播放器
  rondMPlayer(mus_bg, audio) {
    if (mus_bg != null) {
      $(".music-player").css("background-image", "url(" + mus_bg + ")");
      $(".mpadc-fm > img").attr("src", mus_bg);
    }
    // console.log(audio.paused);
    if (audio.paused) {
      $(".mcc-pp > img").attr("src", "icons/pause.svg");
    } else {
      $(".mcc-pp > img").attr("src", "icons/play.svg");
    }
    return 0;
  },
  // 渲染播放列表
  rondMList(datas, type) {
    GroupVariable.PlayListSwiper.removeAllSlides();
    let i = 0;
    if (type == GroupEnum.ModEnum.SEARCH_LIST) {
      datas.forEach((data) => {
        GroupVariable.PlayListSwiper.appendSlide(`
          <div class="swiper-slide music_list_slide" data-niid="${i}">
            <img src="${data.cover}">
            <p>${data.title}</p>
          </div>
        `);
        i++;
      });
    } else if (type == GroupEnum.ModEnum.SLEEP_MUSIC || type == GroupEnum.ModEnum.NOTICE_MUSIC) {
      datas.forEach((data) => {
        GroupVariable.PlayListSwiper.appendSlide(`
          <div class="swiper-slide music_list_slide" data-niid="${i}">
            <img src="${data.cover}">
            <p>${data.title}</p>
          </div>
        `);
        i++;
      });
    } else if(type == GroupEnum.ModEnum.LIKE_MUSIC){
      for (const data of Object.values(datas)) {
        if(data == null) return;
        GroupVariable.PlayListSwiper.appendSlide(`
          <div class="swiper-slide music_list_slide" data-niid="${i}" data-nllid="${data.music_id}">
            <img src="${data.music_pic}" data-nllid="${data.music_id}">
            <p data-nllid="${data.music_id}">${data.music_name}</p>
          </div>
        `);
        i++;
      }
    }else{
      datas.forEach((data) => {
        GroupVariable.PlayListSwiper.appendSlide(`
          <div class="swiper-slide music_list_slide" data-niid="${i}">
            <img src="${data.img}">
            <p>${data.song}</p>
          </div>
        `);
        i++;
      });
    }
  },
  // 渲染喜欢的音乐
  rondLikeList(){
    let datas = GroupVariable.likeListColl;
    let val;
    let n = 0;
    $('.likem-coll').html('');
    for (const val of Object.values(datas)) {
      if(val == null) return;
      $('.likem-coll').append(`
        <div class="like-music-coll" data-nd="${n}" data-qurl='${val.music_type}' data-musicid='${val.music_id}'>
          <img src="${val.music_pic}">
          <span>${val.music_name}</span>
          <p>${val.music_singer}</p>
        </div>
      `);
      n++;
    }
  },
  // 渲染歌词
  rondLRC(lrcMap){
    $('.mpad-lrc').html('');
    $('.mpad-lrc').append(`
        <p><br><br><br><br><br><br><br><br></p>
        <p><br><br><br><br><br><br><br><br></p>  
        <p><br><br><br><br><br><br><br><br></p>   
    `);
    let i = 0;
    lrcMap.forEach((value,key) => {
      if(i == 0) $('.first-ui').text(value);
      if(i == 1) $('.sende-ui').text(value);
      $('.mpad-lrc').append(`
        <p class='js-lrc-text lrc${key}' data-lrctime='${key}'>${value}</p>  
      `);
      i++;
    });
    $('.mpad-lrc').append(`
        <p><br><br><br><br><br><br><br><br></p>
        <p><br><br><br><br><br><br><br><br></p>  
        <p><br><br><br><br><br><br><br><br></p>    
    `);
    GroupVariable.lrcTime = 0;
    GroupVariable.isAllowLrcTimer = true;
  },
  // 渲染喜欢与否
  rondLikeIcon(likeed){
    if(likeed){
      $('.mcc-like > img').attr('src','icons/like_fill.svg');
      return true;
    }
    $('.mcc-like > img').attr('src','icons/like_not.svg');
  },
  // 渲染关于我们
  rondAboutUs(){
    let datas = GroupTips;
    let outputTemp = '';
    datas.forEach((val,ind,self) => {
      outputTemp = '<blockquote class="layui-elem-quote">';
      outputTemp += val.title;
      outputTemp += val.content.replace(/\n/g,'<br />');
      outputTemp += '</blockquote>';
      $('.aboutus-page').append(outputTemp);
    });
  }
};
