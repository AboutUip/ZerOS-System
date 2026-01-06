import { ai as VIcon, d as defineComponent, r as ref, A as reactive, u as useMusicAction, c as createElementBlock, a as createBaseVNode, I as withDirectives, b as createVNode, w as withCtx, e as resolveComponent, X as vShow, l as unref, S as SongList, F as Fragment, m as useRoute, aj as ElNotification, ak as getUserRecord, C as renderList, f as createTextVNode, B as toDisplayString, o as openBlock } from "./index-DUNGDuLl.js";
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
    width: "75%",
    class: "title",
    type: "title",
    lazy: true
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
    processEl: (h, data) => {
      return h("div", [
        h(VIcon, {
          icon: "mdi-play-outline"
        }),
        data.playCount
      ]);
    }
  }
];
const _hoisted_1 = {
  style: { "padding-bottom": "0" },
  class: "padding-container"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const tab = ref();
    const loading = ref(true);
    const state = reactive({
      recent: [],
      history: []
    });
    const recentIds = ref([]);
    const historyIds = ref([]);
    const route = useRoute();
    const music = useMusicAction();
    const tabs = [
      {
        value: "recent",
        label: "最近一周"
      },
      {
        value: "history",
        label: "所有时间"
      }
    ];
    const getUserRecordHandler = async (type) => {
      if (!route.query.uid) {
        ElNotification({
          title: "错误",
          message: "缺少uid参数，尝试刷新页面或重新载入此页面",
          type: "error",
          offset: 80,
          duration: 0
        });
        return;
      }
      const key = type === 1 ? "weekData" : "allData";
      const { [key]: allData } = await getUserRecord(route.query.uid, type);
      if (!allData) {
        return;
      }
      const data = allData.map((item) => ({
        ...item,
        ...item.song
      }));
      if (type === 0) {
        state.history = data;
        historyIds.value = data.map((item) => item.id);
      } else {
        state.recent = data;
        recentIds.value = data.map((item) => item.id);
      }
      music.updateCurrentItem({ id: "userCover" });
    };
    async function init() {
      loading.value = true;
      await getUserRecordHandler(1);
      await getUserRecordHandler(0);
      loading.value = false;
    }
    init();
    return (_ctx, _cache) => {
      const _component_v_tab = resolveComponent("v-tab");
      const _component_v_tabs = resolveComponent("v-tabs");
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1, [
          createVNode(_component_v_tabs, {
            modelValue: tab.value,
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => tab.value = $event),
            "align-tabs": "start",
            color: "primary"
          }, {
            default: withCtx(() => [
              (openBlock(), createElementBlock(Fragment, null, renderList(tabs, (item) => {
                return createVNode(_component_v_tab, {
                  value: item.value
                }, {
                  default: withCtx(() => [
                    createTextVNode(toDisplayString(item.label), 1)
                  ]),
                  _: 2
                }, 1032, ["value"]);
              }), 64))
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        withDirectives(createBaseVNode("div", null, [
          createVNode(SongList, {
            onPlay: unref(music).getMusicUrlHandler,
            columns: unref(columns),
            loading: loading.value,
            songs: unref(music).state.songs,
            ids: recentIds.value,
            list: state.recent,
            isNeedTitle: false,
            lazy: ""
          }, null, 8, ["onPlay", "columns", "loading", "songs", "ids", "list"])
        ], 512), [
          [vShow, tab.value === "recent"]
        ]),
        withDirectives(createBaseVNode("div", null, [
          createVNode(SongList, {
            onPlay: unref(music).getMusicUrlHandler,
            columns: unref(columns),
            loading: loading.value,
            songs: unref(music).state.songs,
            ids: historyIds.value,
            list: state.history,
            isNeedTitle: false,
            lazy: ""
          }, null, 8, ["onPlay", "columns", "loading", "songs", "ids", "list"])
        ], 512), [
          [vShow, tab.value === "history"]
        ])
      ], 64);
    };
  }
});
export {
  _sfc_main as default
};
