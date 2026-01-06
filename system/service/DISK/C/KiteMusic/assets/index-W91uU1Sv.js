import { N as formatDate, d as defineComponent, u as useMusicAction, r as ref, i as usePlayList, c as createElementBlock, a as createBaseVNode, b as createVNode, l as unref, S as SongList, F as Fragment, O as getRecordSong, P as ElMessage, o as openBlock, _ as _export_sfc } from "./index-DUNGDuLl.js";
const columns = [
  {
    title: "#",
    width: "45px",
    type: "index",
    class: "empty",
    style: {
      position: "relative"
    }
  },
  {
    title: "标题",
    prop: "name",
    picUrl: "al.picUrl",
    width: "45%",
    class: "title",
    type: "title",
    lazy: true
  },
  {
    title: "专辑",
    prop: "al.name",
    // 嵌套取值
    width: "35%",
    class: "album",
    type: "album"
  },
  {
    title: "操作",
    width: "45px",
    type: "handle",
    class: "handle",
    icon: ["love"]
  },
  {
    title: "播放时间",
    width: "130px",
    class: "time",
    processEl: (h, data) => {
      return formatDate(data.playTime, "MM-DD hh:mm:ss");
    }
  }
];
const playListMock = {
  id: 9999998,
  // 歌单id
  name: "",
  // 歌单名称
  coverImgUrl: "",
  // 歌单封面图片
  userId: 0,
  // 创建歌单的用户id
  updateTime: 0,
  createTime: 0,
  // 创建时间
  specialType: 300,
  playCount: 0,
  // 播放量
  trackCount: 30,
  //歌单下歌曲总数
  tags: [],
  creator: {
    // 创建这个歌单的用户信息
    nickname: "",
    userId: 0,
    avatarUrl: "",
    userType: 4,
    vipType: 11
  },
  subscribed: false,
  // 是否收藏
  subscribedCount: 0,
  // 收藏总数
  tracks: []
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const music = useMusicAction();
    const loading = ref(false);
    const recordSongList = ref([]);
    const { getLikeMusicIds } = usePlayList();
    const ids = ref([]);
    const getRecordSongHandler = async () => {
      try {
        loading.value = true;
        await getLikeMusicIds();
        const { data } = await getRecordSong();
        recordSongList.value = data.list.map((item) => {
          ids.value.push(item.data.id);
          return {
            ...item,
            ...item.data
          };
        });
        music.updateCurrentItem(playListMock);
      } catch (e) {
        ElMessage.error("获取最近歌曲失败: ", e);
      } finally {
        loading.value = false;
      }
    };
    const init = async () => {
      getRecordSongHandler();
    };
    init();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[0] || (_cache[0] = createBaseVNode("div", { class: "record-song" }, [
          createBaseVNode("h2", null, "保存了近300首的播放记录")
        ], -1)),
        createVNode(SongList, {
          onPlay: unref(music).getMusicUrlHandler,
          columns: unref(columns),
          loading: loading.value,
          songs: unref(music).state.songs,
          list: recordSongList.value,
          listInfo: {},
          ids: ids.value
        }, null, 8, ["onPlay", "columns", "loading", "songs", "list", "ids"])
      ], 64);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-c0fd58ac"]]);
export {
  index as default
};
