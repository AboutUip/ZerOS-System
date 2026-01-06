import { d as defineComponent, n as useModel, j as watch, k as createBlock, w as withCtx, b as createVNode, e as resolveComponent, a as createBaseVNode, f as createTextVNode, o as openBlock, q as computed, t as useUserInfo, v as formattingTime, x as bottom_default, y as getMusicUrl, r as ref, z as convertToProxyUrl, u as useMusicAction, A as reactive, c as createElementBlock, B as toDisplayString, l as unref, m as useRoute, S as SongList, F as Fragment, C as renderList, D as Card, E as useRouter, G as cloudSearch, _ as _export_sfc } from "./index-DUNGDuLl.js";
import { A as AreaBox } from "./index-DTG29Dy1.js";
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "index",
  props: {
    "modelValue": { default: false },
    "modelModifiers": {}
  },
  emits: ["update:modelValue"],
  setup(__props) {
    const visible = useModel(__props, "modelValue");
    watch(visible, (val) => {
      console.log("12312", val);
    });
    const onClose = () => {
      visible.value = false;
    };
    return (_ctx, _cache) => {
      const _component_VBtn = resolveComponent("VBtn");
      const _component_VCardTitle = resolveComponent("VCardTitle");
      const _component_VCardText = resolveComponent("VCardText");
      const _component_VCard = resolveComponent("VCard");
      const _component_VDialog = resolveComponent("VDialog");
      return openBlock(), createBlock(_component_VDialog, {
        modelValue: visible.value,
        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => visible.value = $event),
        scrim: false,
        "max-width": "400"
      }, {
        default: withCtx(() => [
          createVNode(_component_VCard, { rounded: "lg" }, {
            default: withCtx(() => [
              createVNode(_component_VCardTitle, { class: "d-flex justify-space-between align-center" }, {
                default: withCtx(() => [
                  _cache[1] || (_cache[1] = createBaseVNode("div", { class: "text-h5 text-medium-emphasis ps-2" }, "当前歌曲暂无音源", -1)),
                  createVNode(_component_VBtn, {
                    icon: "mdi-close",
                    variant: "text",
                    onClick: onClose
                  })
                ]),
                _: 1
              }),
              createVNode(_component_VCardText, { class: "d-flex justify-center align-center" }, {
                default: withCtx(() => [
                  createVNode(_component_VBtn, {
                    variant: "tonal",
                    onClick: onClose
                  }, {
                    default: withCtx(() => [..._cache[2] || (_cache[2] = [
                      createTextVNode("好", -1)
                    ])]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          })
        ]),
        _: 1
      }, 8, ["modelValue"]);
    };
  }
});
const downloadVisible = ref({});
const store = useUserInfo();
const columns = computed(() => {
  console.log("store.isLogin", store.isLogin);
  return [
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
      width: "40%",
      class: "title",
      type: "title"
    },
    {
      title: "专辑",
      prop: "al.name",
      // 嵌套取值
      width: "20%",
      class: "album"
    },
    {
      title: "操作",
      width: "45px",
      type: "handle",
      class: "handle",
      icon: ["love"]
    },
    {
      title: "时长",
      prop: "dt",
      width: "10%",
      class: "time",
      processEl(h, data) {
        return formattingTime(data.dt);
      }
    },
    {
      title: "下载",
      width: "10%",
      hidden: !store.isLogin,
      processEl(h, { id, name }) {
        return h("div", [
          h(bottom_default, {
            style: {
              width: "20px",
              height: "20px",
              cursor: "pointer"
            },
            async onClick() {
              const { data } = await getMusicUrl(id);
              if (!data[0].url) {
                downloadVisible.value[id] = true;
                return;
              }
              const url = convertToProxyUrl(data[0].url);
              fetch(url).then((response) => response.blob()).then((blob) => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = name + ".mp3";
                link.target = "_blank";
                link.click();
              });
            }
          }),
          h(_sfc_main$1, { modelValue: !!downloadVisible.value[id], "onUpdate:modelValue": (val) => {
            downloadVisible.value[id] = val;
          } })
        ]);
      }
    },
    {
      title: "热度",
      width: "10%",
      processEl(h, data) {
        return h("div", {
          style: { overflow: "hidden", height: "6px", width: "100%", "border-radius": "5px", "background-color": "#373737" }
        }, h("div", {
          style: { height: "100%", "background-color": "rgba(255,255,255,0.2)", width: `${data.pop}%` }
        }));
      }
    }
  ];
});
const tabsConfig = [
  {
    name: "song",
    label: "单曲"
  },
  {
    name: "singer",
    label: "歌手"
  },
  {
    name: "album",
    label: "专辑"
  },
  {
    name: "video",
    label: "视频"
  },
  {
    name: "songList",
    label: "歌单"
  },
  {
    name: "lyric",
    label: "歌词"
  },
  {
    name: "podcast",
    label: "播客"
  },
  {
    name: "voice",
    label: "声音"
  },
  {
    name: "user",
    label: "用户"
  }
];
const _hoisted_1 = { class: "padding-container" };
const _hoisted_2 = { class: "keyword" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const music = useMusicAction();
    const route = useRoute();
    const router = useRouter();
    const limit = ref(50);
    const page = ref(1);
    const loading = ref(false);
    const state = reactive({
      songs: {
        result: [],
        songCount: 0
      },
      songList: {
        playlists: [],
        playlistCount: 0
      }
    });
    ref(tabsConfig[0].name);
    function init() {
      const { key } = route.query;
      search(key, (page.value - 1) * limit.value, limit.value);
      getKeySongList(key, 0, 20);
    }
    const search = async (key, offset, limit2) => {
      loading.value = true;
      const { result } = await cloudSearch(key, offset, limit2).finally(() => {
        loading.value = false;
      });
      state.songs.songCount = result.songCount;
      state.songs.result = result.songs;
      music.updateSearchList(result.songs);
    };
    const currentChange = (val) => {
      page.value = val;
      init();
    };
    const getKeySongList = async (key, offset, limit2) => {
      const { result } = await cloudSearch(key, offset, limit2, 1e3);
      state.songList.playlistCount = result.playlistCount;
      state.songList.playlists = result.playlists;
    };
    const gotoSongList = (item) => {
      router.push({
        path: "/play-list",
        query: {
          id: item.id,
          position: 1
        }
      });
    };
    watch(
      () => route.fullPath,
      (val) => {
        if (route.path === "/search") {
          init();
        }
      },
      {
        immediate: true
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("span", _hoisted_2, [
            createTextVNode(toDisplayString(unref(route).query.key), 1),
            _cache[1] || (_cache[1] = createBaseVNode("span", { class: "keyword-text" }, "的相关搜索如下", -1))
          ]),
          createVNode(AreaBox, {
            onTitleClick: _cache[0] || (_cache[0] = () => {
            })
          }, {
            title: withCtx(() => [..._cache[2] || (_cache[2] = [
              createTextVNode("歌单", -1)
            ])]),
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(state.songList.playlists, (item) => {
                return openBlock(), createBlock(Card, {
                  "is-click": true,
                  onClick: ($event) => gotoSongList(item),
                  name: item.name,
                  "pic-url": item.coverImgUrl
                }, null, 8, ["onClick", "name", "pic-url"]);
              }), 256))
            ]),
            _: 1
          }),
          createVNode(AreaBox, { "is-move": false }, {
            title: withCtx(() => [..._cache[3] || (_cache[3] = [
              createTextVNode("单曲", -1)
            ])]),
            _: 1
          })
        ]),
        createVNode(SongList, {
          onCurrentChange: currentChange,
          onPlay: unref(music).getMusicUrlHandler,
          "is-loading-endflyback": "",
          loading: loading.value,
          columns: unref(columns),
          songs: unref(music).state.songs,
          list: state.songs.result,
          "is-paging": "",
          total: state.songs.songCount,
          "page-size": limit.value,
          "current-page": page.value,
          "is-search": false
        }, null, 8, ["onPlay", "loading", "columns", "songs", "list", "total", "page-size", "current-page"])
      ], 64);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-717fe7a7"]]);
export {
  index as default
};
