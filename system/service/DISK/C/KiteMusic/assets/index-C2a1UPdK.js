import { v as formattingTime, d as defineComponent, u as useMusicAction, A as reactive, a0 as getUserCloud, k as createBlock, l as unref, S as SongList, o as openBlock } from "./index-DUNGDuLl.js";
const columns = [
  {
    title: "#",
    width: "45px",
    type: "index",
    class: "empty"
  },
  {
    title: "标题",
    prop: "name",
    picUrl: "al.picUrl",
    width: "55%",
    class: "title",
    type: "title"
  },
  {
    title: "专辑",
    width: "25%",
    class: "album",
    processEl(h, data) {
      return h("div", (data.al || {}).name || data.album || "未知专辑");
    }
  },
  {
    title: "时间",
    prop: "dt",
    width: "15%",
    class: "time",
    processEl: (h, data) => {
      return formattingTime(data.dt);
    }
  }
];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const music = useMusicAction();
    const state = reactive({
      loading: true,
      ids: [],
      list: [],
      listInfo: {},
      total: 0,
      page: 1,
      limit: 100
    });
    getUserCloudFn();
    async function getUserCloudFn() {
      state.loading = true;
      const { data, count } = await getUserCloud(state.limit, (state.page - 1) * state.limit).finally(
        () => {
          state.loading = false;
        }
      );
      state.total = count;
      state.list = data.map((item) => {
        state.ids.push(item.id);
        return {
          ...item.simpleSong,
          ...item,
          simpleSong: {}
        };
      });
      music.updateCurrentItem({ id: "cloud-songs" });
    }
    const currentChange = (val) => {
      state.page = val;
      getUserCloudFn();
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(SongList, {
        onPlay: unref(music).getMusicUrlHandler,
        onCurrentChange: currentChange,
        "is-loading-endflyback": "",
        "is-paging": "",
        songs: unref(music).state.songs,
        columns: unref(columns),
        loading: state.loading,
        ids: state.ids,
        list: state.list,
        "list-info": state.listInfo,
        "page-size": state.limit,
        total: state.total,
        "current-page": state.page
      }, null, 8, ["onPlay", "songs", "columns", "loading", "ids", "list", "list-info", "page-size", "total", "current-page"]);
    };
  }
});
export {
  _sfc_main as default
};
