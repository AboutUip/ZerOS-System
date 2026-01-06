import { d as defineComponent, A as reactive, r as ref, T as useTheme, j as watch, q as computed, c as createElementBlock, a as createBaseVNode, b as createVNode, V as normalizeStyle, B as toDisplayString, k as createBlock, L as createCommentVNode, w as withCtx, e as resolveComponent, F as Fragment, f as createTextVNode, C as renderList, l as unref, E as useRouter, m as useRoute, o as openBlock, a1 as getArtistDetail, a2 as getArtistAlbum, _ as _export_sfc } from "./index-DUNGDuLl.js";
import { A as AdaptiveListBox, a as AdaptiveList } from "./index-DnfXKc9r.js";
const tabsConfig = [
  {
    label: "专辑",
    name: 1
  },
  {
    label: "MV",
    name: 2
  },
  {
    label: "歌手详情",
    name: 3
  },
  {
    label: "相似歌手",
    name: 4
  }
];
const _hoisted_1 = { class: "singer-card-container" };
const _hoisted_2 = { class: "detail" };
const _hoisted_3 = { class: "name" };
const _hoisted_4 = { class: "alias" };
const _hoisted_5 = { class: "btn" };
const _hoisted_6 = { class: "count" };
const _hoisted_7 = { key: 0 };
const _hoisted_8 = { key: 1 };
const _hoisted_9 = { key: 2 };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const state = reactive({
      singerDetail: {},
      artist: {},
      albums: []
    });
    const activeTab = ref(tabsConfig[0].name);
    const route = useRoute();
    const router = useRouter();
    const theme = useTheme();
    watch(
      () => route.fullPath,
      () => {
        if (route.path === "/singer-page") {
          init();
        }
      },
      {
        immediate: true
      }
    );
    function init() {
      const { id } = route.query;
      if (id) {
        getSingerDetail(id);
        getSingerAlbum(id);
      }
    }
    async function getSingerDetail(id) {
      const { data } = await getArtistDetail(id);
      state.singerDetail = data;
      state.artist = data.artist;
      theme.change(state.artist.avatar);
    }
    async function getSingerAlbum(id) {
      const { hotAlbums } = await getArtistAlbum(id);
      state.albums = hotAlbums;
    }
    const alias = computed(() => {
      return state.artist.alias?.join("；");
    });
    const gotoUserDetail = () => {
      router.push({
        path: "/detail",
        query: {
          uid: state.singerDetail.user.userId
        }
      });
    };
    const getAlbumContentHandler = async (id) => {
      router.push({
        path: "/play-list",
        query: {
          id,
          type: "album"
        }
      });
    };
    return (_ctx, _cache) => {
      const _component_v_btn = resolveComponent("v-btn");
      const _component_card = resolveComponent("card");
      const _component_tab_pane = resolveComponent("tab-pane");
      const _component_tabs = resolveComponent("tabs");
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("div", {
            style: normalizeStyle({ backgroundImage: `url(${state.artist.avatar})` }),
            class: "avatar"
          }, null, 4),
          createBaseVNode("div", _hoisted_2, [
            createBaseVNode("h2", _hoisted_3, toDisplayString(state.artist.name), 1),
            createBaseVNode("div", _hoisted_4, toDisplayString(alias.value), 1),
            createBaseVNode("div", _hoisted_5, [
              createVNode(_component_v_btn, {
                variant: "tonal",
                rounded: "lg"
              }, {
                default: withCtx(() => [..._cache[1] || (_cache[1] = [
                  createTextVNode("已收藏", -1)
                ])]),
                _: 1
              }),
              state.singerDetail.user ? (openBlock(), createBlock(_component_v_btn, {
                key: 0,
                onClick: gotoUserDetail,
                variant: "tonal",
                rounded: "lg"
              }, {
                default: withCtx(() => [..._cache[2] || (_cache[2] = [
                  createTextVNode("个人主页", -1)
                ])]),
                _: 1
              })) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_6, [
              state.artist.musicSize ? (openBlock(), createElementBlock("span", _hoisted_7, "单曲数:" + toDisplayString(state.artist.musicSize), 1)) : createCommentVNode("", true),
              state.artist.albumSize ? (openBlock(), createElementBlock("span", _hoisted_8, "专辑数:" + toDisplayString(state.artist.albumSize), 1)) : createCommentVNode("", true),
              state.artist.mvSize ? (openBlock(), createElementBlock("span", _hoisted_9, "MV数:" + toDisplayString(state.artist.mvSize), 1)) : createCommentVNode("", true)
            ])
          ])
        ]),
        createVNode(AdaptiveListBox, null, {
          default: withCtx(() => [
            createVNode(_component_tabs, {
              modelValue: activeTab.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => activeTab.value = $event)
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(tabsConfig), (item) => {
                  return openBlock(), createBlock(_component_tab_pane, {
                    name: item.name,
                    label: item.label
                  }, {
                    default: withCtx(() => [
                      createVNode(AdaptiveList, null, {
                        default: withCtx(() => [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(state.albums, (item2) => {
                            return openBlock(), createBlock(_component_card, {
                              onClick: ($event) => getAlbumContentHandler(item2.id),
                              name: item2.name,
                              picUrl: item2.picUrl,
                              "is-click": "",
                              "is-start-icon": ""
                            }, null, 8, ["onClick", "name", "picUrl"]);
                          }), 256))
                        ]),
                        _: 2
                      }, 1024)
                    ]),
                    _: 2
                  }, 1032, ["name", "label"]);
                }), 256))
              ]),
              _: 1
            }, 8, ["modelValue"])
          ]),
          _: 1
        })
      ], 64);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-e42a9458"]]);
export {
  index as default
};
