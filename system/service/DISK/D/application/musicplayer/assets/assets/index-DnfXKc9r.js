import { d as defineComponent, c as createElementBlock, M as normalizeClass, V as normalizeStyle, H as renderSlot, o as openBlock, _ as _export_sfc, I as withDirectives, J as resolveDirective } from "./index-DUNGDuLl.js";
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "index",
  props: {
    isShowBg: { type: Boolean, default: true },
    listStyle: {}
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        style: normalizeStyle(__props.listStyle),
        class: normalizeClass(["list-container", { bg: __props.isShowBg }])
      }, [
        renderSlot(_ctx.$slots, "default", {}, void 0, true)
      ], 6);
    };
  }
});
const AdaptiveListBox = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-e0c4d467"]]);
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  props: {
    AdaptiveStyle: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      const _directive_loading = resolveDirective("loading");
      return withDirectives((openBlock(), createElementBlock("div", {
        style: normalizeStyle(__props.AdaptiveStyle),
        class: "play-list"
      }, [
        renderSlot(_ctx.$slots, "default", {}, void 0, true)
      ], 4)), [
        [_directive_loading, __props.loading]
      ]);
    };
  }
});
const AdaptiveList = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-c97b77e8"]]);
export {
  AdaptiveListBox as A,
  AdaptiveList as a
};
