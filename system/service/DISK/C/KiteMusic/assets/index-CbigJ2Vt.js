import { d as defineComponent, i as usePlayList, u as useMusicAction, c as createElementBlock, k as createBlock, b as createVNode, l as unref, m as useRoute, a as createBaseVNode, B as toDisplayString, Q as varDayim, w as withCtx, R as BaseButton, p as playListState, S as SongList, F as Fragment, f as createTextVNode, o as openBlock, _ as _export_sfc } from "./index-DUNGDuLl.js";
import { c as columns, S as SongInfo } from "./config-pQX0jq6m.js";
const _hoisted_1 = {
  key: 1,
  class: "padding-container"
};
const _hoisted_2 = { class: "top" };
const _hoisted_3 = { class: "day" };
const _hoisted_4 = { class: "text" };
const _hoisted_5 = { class: "bottom" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const { getPlayListDetailFn, getRecommendSongs } = usePlayList();
    const route = useRoute();
    const music = useMusicAction();
    const init = () => {
      const { id } = route.query;
      if (id === "recommendSongs") {
        getRecommendSongs();
      } else {
        id && getPlayListDetailFn(+id);
      }
    };
    init();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        unref(route).query.id !== "recommendSongs" ? (openBlock(), createBlock(SongInfo, { key: 0 })) : (openBlock(), createElementBlock("div", _hoisted_1, [
          createBaseVNode("div", _hoisted_2, [
            createBaseVNode("div", _hoisted_3, [
              _cache[0] || (_cache[0] = createBaseVNode("div", { class: "row-left row" }, null, -1)),
              _cache[1] || (_cache[1] = createBaseVNode("div", { class: "row-right row" }, null, -1)),
              _cache[2] || (_cache[2] = createBaseVNode("div", { class: "line" }, null, -1)),
              createBaseVNode("div", _hoisted_4, toDisplayString(unref(varDayim)()), 1)
            ]),
            _cache[3] || (_cache[3] = createBaseVNode("div", { class: "text-info" }, [
              createBaseVNode("div", { class: "text-info-title" }, "每日歌曲推荐"),
              createBaseVNode("div", { class: "text-info-desc" }, "根据您的音乐口味生成, 每天6:00更新")
            ], -1))
          ]),
          createBaseVNode("div", _hoisted_5, [
            createVNode(BaseButton, { type: "subject" }, {
              default: withCtx(() => [..._cache[4] || (_cache[4] = [
                createTextVNode("播放全部", -1)
              ])]),
              _: 1
            }),
            createVNode(BaseButton, null, {
              default: withCtx(() => [..._cache[5] || (_cache[5] = [
                createTextVNode("收藏全部", -1)
              ])]),
              _: 1
            })
          ])
        ])),
        createVNode(SongList, {
          onPlay: unref(music).getMusicUrlHandler,
          columns: unref(columns),
          loading: unref(playListState).loading,
          songs: unref(music).state.songs,
          ids: unref(playListState).ids,
          list: unref(playListState).playList,
          "list-info": unref(playListState).listInfo
        }, null, 8, ["onPlay", "columns", "loading", "songs", "ids", "list", "list-info"])
      ], 64);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f78d5f44"]]);
export {
  index as default
};
