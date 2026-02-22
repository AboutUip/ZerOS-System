import { d as defineComponent, u as useMusicAction, i as usePlayList, j as watch, c as createElementBlock, b as createVNode, k as createBlock, l as unref, p as playListState, m as useRoute, S as SongList, F as Fragment, o as openBlock } from "./index-DUNGDuLl.js";
import { S as SongInfo, c as columns } from "./config-pQX0jq6m.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const route = useRoute();
    const music = useMusicAction();
    const { getPlayListDetailFn } = usePlayList();
    watch(
      () => route.fullPath,
      () => {
        if (route.query.id && route.path === "/play-list") {
          getPlayListDetailFn(+route.query.id, route.query.type);
          document.querySelector(".main").scrollTop = 0;
        }
      },
      {
        immediate: true
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        createVNode(SongInfo),
        (openBlock(), createBlock(SongList, {
          onPlay: unref(music).getMusicUrlHandler,
          key: unref(route).query.id,
          columns: unref(columns),
          loading: unref(playListState).loading,
          songs: unref(music).state.songs,
          ids: unref(playListState).ids,
          list: unref(playListState).playList,
          "list-info": unref(playListState).listInfo,
          lazy: ""
        }, null, 8, ["onPlay", "columns", "loading", "songs", "ids", "list", "list-info"]))
      ], 64);
    };
  }
});
export {
  _sfc_main as default
};
