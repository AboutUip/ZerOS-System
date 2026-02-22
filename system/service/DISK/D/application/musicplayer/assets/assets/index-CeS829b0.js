import { d as defineComponent, a3 as useFlags, r as ref, A as reactive, m as useRoute, a4 as onMounted, j as watch, c as createElementBlock, L as createCommentVNode, a as createBaseVNode, B as toDisplayString, F as Fragment, C as renderList, b as createVNode, a5 as withModifiers, a6 as Pagination, a7 as getCommentMusic, a8 as getMusicDetail, V as normalizeStyle, w as withCtx, e as resolveComponent, E as useRouter, o as openBlock, W as toggleImg, _ as _export_sfc } from "./index-DUNGDuLl.js";
const _hoisted_1 = { class: "comment" };
const _hoisted_2 = {
  key: 0,
  class: "comment-box"
};
const _hoisted_3 = { class: "info" };
const _hoisted_4 = { class: "song-info" };
const _hoisted_5 = { class: "song-name" };
const _hoisted_6 = { class: "singers" };
const _hoisted_7 = { class: "singer-info" };
const _hoisted_8 = { class: "album" };
const _hoisted_9 = { class: "comment-content" };
const _hoisted_10 = { class: "comment-content-box" };
const _hoisted_11 = { class: "content-line" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = { class: "right-box" };
const _hoisted_14 = { class: "comment-text" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "text" };
const _hoisted_17 = { class: "handle-box" };
const _hoisted_18 = { class: "time" };
const _hoisted_19 = { class: "operation" };
const _hoisted_20 = { style: { "font-size": "12px" } };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const flags = useFlags();
    const router = useRouter();
    const route = useRoute();
    const page = ref(1);
    const state = reactive({
      comments: [],
      song: null,
      total: 0,
      pageSize: 20,
      currentPage: 1
    });
    let id = +route.query.id;
    ref();
    const imgEl = ref();
    const bg = ref("");
    onMounted(() => {
      watch(bg, (val) => {
        toggleImg(val).then((img) => {
          imgEl.value.style.backgroundImage = `url(${img.src})`;
        });
      });
    });
    const getCommentMusicFn = async (id2, page2) => {
      const { data, code } = await getCommentMusic(id2, 0, page2, 20, 2);
      if (code === 200) {
        state.comments = data.comments;
        state.total = data.totalCount;
      }
    };
    const currentChange = (page2) => {
      state.currentPage = page2;
      getCommentMusicFn(id, page2);
    };
    const getMusicDetailFn = async (id2) => {
      const { songs } = await getMusicDetail(String(id2));
      state.song = songs[0];
      bg.value = state.song.al.picUrl;
    };
    function init() {
      getCommentMusicFn(id, page.value);
      getMusicDetailFn(id);
    }
    init();
    const gotoUserDetail = (uid) => {
      flags.isOpenDetail = false;
      router.push({
        path: "/detail",
        query: {
          uid
        }
      });
    };
    watch(
      () => +route.query.id,
      (value) => {
        if (route.path === "/comment") {
          id = value;
          init();
        }
      }
    );
    return (_ctx, _cache) => {
      const _component_Star = resolveComponent("Star");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_ChatDotSquare = resolveComponent("ChatDotSquare");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        state.song !== null ? (openBlock(), createElementBlock("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", {
              ref_key: "imgEl",
              ref: imgEl,
              class: "bg-img"
            }, null, 512),
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, toDisplayString(state.song.name), 1),
              createBaseVNode("div", _hoisted_6, [
                createBaseVNode("div", _hoisted_7, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(state.song.ar, (item, index2) => {
                    return openBlock(), createElementBlock("span", null, "歌手: " + toDisplayString(item.name + (index2 < state.song.ar.length - 1 ? "/" : "")), 1);
                  }), 256))
                ]),
                createBaseVNode("div", _hoisted_8, "专辑: " + toDisplayString(state.song.al.name), 1)
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("div", _hoisted_10, [
              _cache[3] || (_cache[3] = createBaseVNode("div", { class: "title" }, "精彩评论", -1)),
              createBaseVNode("div", {
                onWheel: _cache[0] || (_cache[0] = withModifiers(() => {
                }, ["stop"])),
                class: "content"
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(state.comments, (item) => {
                  return openBlock(), createElementBlock("div", _hoisted_11, [
                    createBaseVNode("div", {
                      onClick: ($event) => gotoUserDetail(item.user.userId),
                      style: normalizeStyle({ backgroundImage: `url(${item.user.avatarUrl})` }),
                      class: "photo"
                    }, null, 12, _hoisted_12),
                    createBaseVNode("div", _hoisted_13, [
                      createBaseVNode("div", _hoisted_14, [
                        createBaseVNode("div", {
                          onClick: ($event) => gotoUserDetail(item.user.userId),
                          class: "name"
                        }, toDisplayString(item.user.nickname) + ": ", 9, _hoisted_15),
                        createBaseVNode("div", _hoisted_16, toDisplayString(item.content), 1)
                      ]),
                      createBaseVNode("div", _hoisted_17, [
                        createBaseVNode("div", _hoisted_18, toDisplayString(item.timeStr), 1),
                        createBaseVNode("div", _hoisted_19, [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(_component_Star)
                            ]),
                            _: 1
                          }),
                          createBaseVNode("span", _hoisted_20, toDisplayString(item.likedCount), 1),
                          _cache[1] || (_cache[1] = createBaseVNode("div", { class: "operator-line" }, null, -1)),
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(_component_ChatDotSquare)
                            ]),
                            _: 1
                          })
                        ])
                      ])
                    ]),
                    _cache[2] || (_cache[2] = createBaseVNode("div", { class: "line" }, null, -1))
                  ]);
                }), 256))
              ], 32),
              createVNode(Pagination, {
                onCurrentChange: currentChange,
                total: state.total,
                pageSize: state.pageSize,
                currentPage: state.currentPage
              }, null, 8, ["total", "pageSize", "currentPage"])
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-7a6e97a9"]]);
export {
  index as default
};
