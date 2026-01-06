import { d as defineComponent, r as ref, c as createElementBlock, k as createBlock, H as renderSlot, w as withCtx, e as resolveComponent, b as createVNode, F as Fragment, C as renderList, o as openBlock, A as reactive, I as withDirectives, J as resolveDirective, K as recommendSongList, D as Card, l as unref, f as createTextVNode, E as useRouter, _ as _export_sfc } from "./index-DUNGDuLl.js";
import { A as AreaBox } from "./index-DTG29Dy1.js";
const recommendImage = "" + new URL("recommend-CCu2j9so.png", import.meta.url).href;
const _sfc_main$7 = /* @__PURE__ */ defineComponent({
  __name: "index",
  props: {
    loading: { type: Boolean }
  },
  setup(__props) {
    const cards = ref([
      {
        title: "Homemade Dulce de Leche Ice Cream with Chocolate Chips",
        subtitle: "Happy Foods",
        src: "https://cdn.vuetifyjs.com/docs/images/graphics/dulce-ice-cream.png"
      },
      {
        title: "Salted Caramel Swirl Ice Cream",
        subtitle: "Stone Kitchen",
        src: "https://cdn.vuetifyjs.com/docs/images/graphics/salted-caramel-ice-cream.png"
      },
      {
        title: "Peanut Butter No-Churn Ice Cream",
        subtitle: "The Sweeter Side",
        src: "https://cdn.vuetifyjs.com/docs/images/graphics/peanut-butter-ice-cream.png"
      }
    ]);
    return (_ctx, _cache) => {
      const _component_v_skeleton_loader = resolveComponent("v-skeleton-loader");
      const _component_v_col = resolveComponent("v-col");
      const _component_v_row = resolveComponent("v-row");
      const _component_v_container = resolveComponent("v-container");
      return openBlock(), createElementBlock("div", null, [
        __props.loading ? (openBlock(), createBlock(_component_v_container, { key: 0 }, {
          default: withCtx(() => [
            createVNode(_component_v_row, null, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(cards.value, ({ src, title, subtitle }) => {
                  return openBlock(), createBlock(_component_v_col, {
                    key: title,
                    cols: "12",
                    lg: "4",
                    md: "6"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_v_skeleton_loader, {
                        loading: __props.loading,
                        height: "240",
                        type: "image, list-item-two-line"
                      }, null, 8, ["loading"])
                    ]),
                    _: 1
                  });
                }), 128))
              ]),
              _: 1
            })
          ]),
          _: 1
        })) : renderSlot(_ctx.$slots, "default", { key: 1 })
      ]);
    };
  }
});
const _hoisted_1$1 = { class: "container" };
const recommendSongs = "recommendSongs";
const _sfc_main$6 = /* @__PURE__ */ defineComponent({
  __name: "individual",
  setup(__props) {
    const state = reactive({
      recommend: [],
      loading: false
    });
    const router = useRouter();
    async function init() {
      state.loading = true;
      const { recommend } = await recommendSongList();
      state.loading = false;
      state.recommend = recommend;
    }
    init();
    const playDetailList = (item) => {
      const id = item.id || item;
      router.push(`/daily-recommend?id=${id}`);
    };
    return (_ctx, _cache) => {
      const _directive_loading = resolveDirective("loading");
      return withDirectives((openBlock(), createElementBlock("div", _hoisted_1$1, [
        createVNode(_sfc_main$7, {
          loading: state.loading
        }, {
          default: withCtx(() => [
            createVNode(AreaBox, null, {
              title: withCtx(() => [..._cache[1] || (_cache[1] = [
                createTextVNode("歌单", -1)
              ])]),
              default: withCtx(() => [
                createVNode(Card, {
                  "is-click": true,
                  onClick: _cache[0] || (_cache[0] = ($event) => playDetailList(recommendSongs)),
                  name: "每日歌曲推荐",
                  "pic-url": unref(recommendImage)
                }, null, 8, ["pic-url"]),
                (openBlock(true), createElementBlock(Fragment, null, renderList(state.recommend, (item) => {
                  return openBlock(), createBlock(Card, {
                    "is-click": true,
                    onClick: ($event) => playDetailList(item),
                    name: item.name,
                    "pic-url": item.picUrl
                  }, null, 8, ["onClick", "name", "pic-url"]);
                }), 256))
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["loading"])
      ])), [
        [_directive_loading, state.loading]
      ]);
    };
  }
});
const Individual = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-cc563ab7"]]);
const _sfc_main$5 = {};
function _sfc_render$4(_ctx, _cache) {
  return " Custom ";
}
const Custom = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$4]]);
const _sfc_main$4 = {};
function _sfc_render$3(_ctx, _cache) {
  return " RankingList ";
}
const RankingList = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$3]]);
const _sfc_main$3 = {};
function _sfc_render$2(_ctx, _cache) {
  return " SongMenu ";
}
const SongMenu = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2]]);
const _sfc_main$2 = {};
function _sfc_render$1(_ctx, _cache) {
  return " Singer ";
}
const Singer = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1]]);
const _sfc_main$1 = {};
function _sfc_render(_ctx, _cache) {
  return " NewestMusic ";
}
const NewestMusic = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render]]);
const tabsConfig = [
  {
    label: "个性推荐",
    name: "individual",
    component: Individual
  },
  {
    label: "专属定制",
    name: "custom",
    component: Custom
  },
  {
    label: "歌单",
    name: "songMenu",
    component: SongMenu
  },
  {
    label: "排行榜",
    name: "rankingList",
    component: RankingList
  },
  {
    label: "歌手",
    name: "singer",
    component: Singer
  },
  {
    label: "最新音乐",
    name: "newestMusic",
    component: NewestMusic
  }
];
const _hoisted_1 = { class: "padding-container" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    ref(tabsConfig[0].name);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(Individual)
      ]);
    };
  }
});
export {
  _sfc_main as default
};
