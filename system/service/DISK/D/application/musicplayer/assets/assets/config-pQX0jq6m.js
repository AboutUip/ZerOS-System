import { d as defineComponent, u as useMusicAction, t as useUserInfo, r as ref, T as useTheme, j as watch, c as createElementBlock, L as createCommentVNode, l as unref, a as createBaseVNode, B as toDisplayString, U as formatNumberToMillion, V as normalizeStyle, N as formatDate, b as createVNode, e as resolveComponent, w as withCtx, E as useRouter, f as createTextVNode, m as useRoute, o as openBlock, W as toggleImg, _ as _export_sfc, v as formattingTime } from "./index-DUNGDuLl.js";
const _hoisted_1 = {
  key: 0,
  class: "list-info"
};
const _hoisted_2 = { class: "count" };
const _hoisted_3 = { class: "right" };
const _hoisted_4 = { class: "song-name" };
const _hoisted_5 = { class: "name" };
const _hoisted_6 = { class: "song-info" };
const _hoisted_7 = { class: "create-timer" };
const _hoisted_8 = {
  key: 0,
  class: "text-info-desc"
};
const _hoisted_9 = { class: "song-handle" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const music = useMusicAction();
    useUserInfo();
    const left = ref();
    const theme = useTheme();
    const router = useRouter();
    useRoute();
    watch(
      () => music.state.currentItem?.coverImgUrl,
      (val) => {
        if (val) {
          toggleImg(val, "350y350").then((img) => {
            if (left.value) {
              left.value.style.backgroundImage = `url(${img.src})`;
            }
          });
          theme.change(val);
        }
      },
      {
        immediate: true
      }
    );
    const gotoUserDetail = () => {
      router.push({
        path: "/detail",
        query: {
          uid: music.state.currentItem.userId
        }
      });
    };
    return (_ctx, _cache) => {
      const _component_v_btn = resolveComponent("v-btn");
      return unref(music).state.currentItem?.coverImgUrl ? (openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", null, [
          createBaseVNode("div", {
            ref_key: "left",
            ref: left,
            class: "left"
          }, [
            createBaseVNode("span", _hoisted_2, toDisplayString(unref(formatNumberToMillion)(unref(music).state.currentItem?.playCount)), 1)
          ], 512)
        ]),
        createBaseVNode("div", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            _cache[0] || (_cache[0] = createBaseVNode("div", { class: "tag" }, "歌单", -1)),
            createBaseVNode("div", _hoisted_5, toDisplayString(unref(music).state.currentItem?.name), 1)
          ]),
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("div", {
              style: normalizeStyle({ backgroundImage: `url(${unref(music).state.currentItem.creator?.avatarUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"})` }),
              class: "avatar"
            }, null, 4),
            createBaseVNode("div", {
              onClick: gotoUserDetail,
              class: "nickname"
            }, toDisplayString(unref(music).state.currentItem?.creator.nickname), 1),
            createBaseVNode("div", _hoisted_7, toDisplayString(unref(formatDate)(unref(music).state.currentItem?.createTime, "YY-MM-DD hh:mm:ss")) + "创建 ", 1)
          ]),
          unref(music).state.currentItem?.description ? (openBlock(), createElementBlock("span", _hoisted_8, toDisplayString(unref(music).state.currentItem?.description), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_9, [
            createVNode(_component_v_btn, {
              variant: "tonal",
              rounded: "lg"
            }, {
              default: withCtx(() => [..._cache[1] || (_cache[1] = [
                createTextVNode("播放全部", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_v_btn, {
              variant: "tonal",
              rounded: "lg"
            }, {
              default: withCtx(() => [..._cache[2] || (_cache[2] = [
                createTextVNode("收藏", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_v_btn, {
              variant: "tonal",
              rounded: "lg"
            }, {
              default: withCtx(() => [..._cache[3] || (_cache[3] = [
                createTextVNode("下载全部", -1)
              ])]),
              _: 1
            })
          ])
        ])
      ])) : createCommentVNode("", true);
    };
  }
});
const SongInfo = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6073acd5"]]);
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
    title: "时长",
    prop: "dt",
    width: "10%",
    class: "time",
    processEl: (h, data) => {
      return formattingTime(data.dt);
    }
  }
];
export {
  SongInfo as S,
  columns as c
};
