import { d as defineComponent, A as reactive, r as ref, T as useTheme, j as watch, q as computed, c as createElementBlock, a as createBaseVNode, b as createVNode, V as normalizeStyle, B as toDisplayString, k as createBlock, L as createCommentVNode, w as withCtx, e as resolveComponent, F as Fragment, f as createTextVNode, C as renderList, l as unref, E as useRouter, m as useRoute, o as openBlock, a1 as getArtistDetail, a2 as getArtistAlbum, a1mv as getArtistMv, a1desc as getArtistDesc, a1simi as getSimiArtist, _ as _export_sfc } from "./index-DUNGDuLl.js";
const tabsConfig = [
  { label: "专辑", name: "1" },
  { label: "MV", name: "2" },
  { label: "歌手详情", name: "3" },
  { label: "相似歌手", name: "4" }
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
      albums: [],
      artistMvs: [],
      artistDesc: { introduction: [], briefDesc: "" },
      similarArtists: []
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
        getSingerMv(id);
        getSingerDesc(id);
        getSingerSimi(id);
      }
    }
    async function getSingerDetail(id) {
      try {
        const { data } = await getArtistDetail(id);
        state.singerDetail = data;
        state.artist = data.artist || {};
        if (state.artist.avatar) theme.change(state.artist.avatar);
      } catch (e) {}
    }
    async function getSingerAlbum(id) {
      try {
        const { hotAlbums } = await getArtistAlbum(id);
        state.albums = hotAlbums || [];
      } catch (e) { state.albums = []; }
    }
    async function getSingerMv(id) {
      try {
        const res = await getArtistMv(id);
        state.artistMvs = (res && res.mvs) ? res.mvs : [];
      } catch (e) { state.artistMvs = []; }
    }
    async function getSingerDesc(id) {
      try {
        const res = await getArtistDesc(id);
        state.artistDesc = {
          introduction: (res && res.introduction) ? res.introduction : [],
          briefDesc: (res && res.briefDesc) ? res.briefDesc : ""
        };
      } catch (e) { state.artistDesc = { introduction: [], briefDesc: "" }; }
    }
    async function getSingerSimi(id) {
      try {
        const res = await getSimiArtist(id);
        state.similarArtists = (res && res.artists) ? res.artists : [];
      } catch (e) { state.similarArtists = []; }
    }
    const alias = computed(() => {
      return state.artist.alias?.join("；");
    });
    const gotoUserDetail = () => {
      const uid = state.singerDetail.user?.userId;
      if (uid != null) router.push({ path: "/detail", query: { uid } });
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
    const goToMv = (mvid) => {
      router.push({ path: "/video", query: { mvid } });
    };
    const goToSinger = (id) => {
      if (id) router.push({ path: "/singer-page", query: { id } });
    };
    function renderTabContent(item, card, openBlock, createElementBlock, Fragment, renderList, createBlock, createBaseVNode, createCommentVNode, toDisplayString) {
      const panelKey = "tab-" + (item && item.name ? item.name : "1");
      var children;
      if (item.name === "1") {
        children = state.albums.length
          ? renderList(state.albums, (item2) => (openBlock(), createBlock(card, {
            onClick: ($event) => getAlbumContentHandler(item2.id),
            name: item2.name,
            picUrl: item2.picUrl,
            "is-click": "",
            "is-start-icon": ""
          }, null, 8, ["onClick", "name", "picUrl"])))
          : [createBaseVNode("div", { class: "empty-tip" }, "暂无专辑", 1)];
        return openBlock(), createElementBlock("div", { key: panelKey, class: "singer-tab-panel" }, children, 0);
      }
      if (item.name === "2") {
        children = state.artistMvs.length
          ? renderList(state.artistMvs, (mv) => (openBlock(), createBlock(card, {
            onClick: ($event) => goToMv(mv.id),
            name: mv.name,
            picUrl: mv.imgurl || mv.imgurl16v9,
            "is-click": "",
            "is-start-icon": ""
          }, null, 8, ["onClick", "name", "picUrl"])))
          : [createBaseVNode("div", { class: "empty-tip" }, "暂无MV", 1)];
        return openBlock(), createElementBlock("div", { key: panelKey, class: "singer-tab-panel" }, children, 0);
      }
      if (item.name === "3") {
        const desc = state.artistDesc.briefDesc || (state.artist && state.artist.briefDesc) || "";
        const introList = state.artistDesc.introduction || [];
        const descStr = typeof desc === "string" ? desc : "";
        const isEmpty = !descStr && !introList.length;
        children = isEmpty
          ? [createBaseVNode("p", { class: "empty-tip" }, "暂无歌手介绍", 1)]
          : [
            descStr ? createBaseVNode("p", { class: "brief-desc" }, toDisplayString(descStr), 1) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(introList, (intro) => {
              const ti = (intro && typeof intro.ti === "string") ? intro.ti : (intro && intro.ti != null ? String(intro.ti) : "");
              const txt = (intro && typeof intro.txt === "string") ? intro.txt : (intro && intro.txt != null ? String(intro.txt) : "");
              return (openBlock(), createElementBlock("div", { key: ti || ("intro-" + txt.slice(0, 30)), class: "intro-item" }, [
                createBaseVNode("h4", null, toDisplayString(ti), 1),
                createBaseVNode("p", { class: "intro-txt" }, toDisplayString(txt), 1)
              ], 1));
            }), 0))
          ];
        return openBlock(), createElementBlock("div", { key: panelKey, class: "singer-tab-panel singer-desc-wrap" }, children, 0);
      }
      children = state.similarArtists.length
        ? renderList(state.similarArtists, (ar) => (openBlock(), createBlock(card, {
          onClick: ($event) => goToSinger(ar.id),
          name: ar.name,
          picUrl: ar.picUrl || ar.img1v1Url,
          "is-click": "",
          "is-start-icon": ""
        }, null, 8, ["onClick", "name", "picUrl"])))
        : [createBaseVNode("div", { class: "empty-tip" }, "暂无相似歌手", 1)];
      return openBlock(), createElementBlock("div", { key: panelKey, class: "singer-tab-panel" }, children, 0);
    }
    const setActiveTab = (name) => {
      activeTab.value = name;
    };
    const currentTabItem = computed(() => {
      return tabsConfig.find(function(t) { return t.name === activeTab.value; }) || tabsConfig[0];
    });
    return (_ctx, _cache) => {
      const _component_v_btn = resolveComponent("v-btn");
      const _component_card = resolveComponent("card");
      return openBlock(), createBaseVNode("div", { class: "singer-page-root" }, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("div", {
            style: normalizeStyle(state.artist.avatar ? { backgroundImage: "url(" + state.artist.avatar + ")" } : {}),
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
        createBaseVNode("div", { class: "list-container" }, [
          createBaseVNode("div", { class: "singer-tabs-wrapper" }, [
            createBaseVNode("div", { class: "singer-tabs-nav" }, renderList(unref(tabsConfig), (item) => {
              return createBaseVNode("div", {
                key: item.name,
                class: ["singer-tab-item", { "is-active": activeTab.value === item.name }],
                onClick: () => setActiveTab(item.name)
              }, toDisplayString(item.label), 3);
            }), 0),
            createBaseVNode("div", { class: "singer-tabs-content" }, [
              renderTabContent(currentTabItem.value, _component_card, openBlock, createElementBlock, Fragment, renderList, createBlock, createBaseVNode, createCommentVNode, toDisplayString)
            ], 0)
          ], 0)
        ], 0)
      ], 0);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-e42a9458"]]);
export {
  index as default
};
