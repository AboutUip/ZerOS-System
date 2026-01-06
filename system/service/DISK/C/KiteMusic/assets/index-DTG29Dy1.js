import { d as defineComponent, r as ref, c as createElementBlock, a as createBaseVNode, L as createCommentVNode, H as renderSlot, b as createVNode, e as resolveComponent, w as withCtx, M as normalizeClass, o as openBlock, _ as _export_sfc } from "./index-DUNGDuLl.js";
const _hoisted_1 = { class: "area-box" };
const _hoisted_2 = { class: "head" };
const _hoisted_3 = { class: "title" };
const _hoisted_4 = { style: { "cursor": "pointer" } };
const _hoisted_5 = {
  key: 0,
  class: "move-container"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  props: {
    isMove: { type: Boolean, default: true }
  },
  emits: ["titleClick"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const content = ref();
    const left = ref(0);
    const rightDisabled = ref(false);
    const leftDisabled = ref(true);
    const moveHandler = (direction) => {
      if (content.value) {
        const children = content.value.children;
        const containerWidth = content.value.clientWidth;
        const totalScrollWidth = content.value.scrollWidth;
        const currentScrollLeft = content.value.scrollLeft;
        if (direction === "right" && !rightDisabled.value) {
          for (let i = 0; i < children.length; i++) {
            const el = children[i];
            const distance = el.offsetLeft + el.clientWidth;
            if (distance > currentScrollLeft + containerWidth) {
              left.value = el.offsetLeft;
              break;
            }
          }
          content.value.scrollTo({
            left: left.value,
            behavior: "smooth"
          });
          if (Math.ceil(currentScrollLeft + containerWidth) >= totalScrollWidth - containerWidth) {
            rightDisabled.value = true;
          }
          leftDisabled.value = false;
        } else if (direction === "left" && !leftDisabled.value) {
          for (let i = children.length - 1; i >= 0; i--) {
            const el = children[i];
            const distance = el.offsetLeft;
            if (distance < currentScrollLeft) {
              left.value = el.offsetLeft + el.clientWidth - containerWidth;
              break;
            }
          }
          content.value.scrollTo({
            left: left.value,
            behavior: "smooth"
          });
          if (left.value <= 0) {
            leftDisabled.value = true;
          }
          rightDisabled.value = false;
        }
      }
    };
    return (_ctx, _cache) => {
      const _component_ArrowRightBold = resolveComponent("ArrowRightBold");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_ArrowLeft = resolveComponent("ArrowLeft");
      const _component_ArrowRight = resolveComponent("ArrowRight");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("span", _hoisted_4, [
              renderSlot(_ctx.$slots, "title", {}, void 0, true),
              createVNode(_component_el_icon, {
                style: { "position": "relative", "top": "1px" },
                size: 16
              }, {
                default: withCtx(() => [
                  createVNode(_component_ArrowRightBold)
                ]),
                _: 1
              })
            ]),
            props.isMove ? (openBlock(), createElementBlock("div", _hoisted_5, [
              createBaseVNode("div", {
                onClick: _cache[0] || (_cache[0] = ($event) => moveHandler("left")),
                class: normalizeClass(["left", "move", leftDisabled.value ? "disabled" : ""])
              }, [
                createVNode(_component_el_icon, { size: 20 }, {
                  default: withCtx(() => [
                    createVNode(_component_ArrowLeft)
                  ]),
                  _: 1
                })
              ], 2),
              createBaseVNode("div", {
                onClick: _cache[1] || (_cache[1] = ($event) => moveHandler("right")),
                class: normalizeClass(["right", "move", rightDisabled.value ? "disabled" : ""])
              }, [
                createVNode(_component_el_icon, { size: 20 }, {
                  default: withCtx(() => [
                    createVNode(_component_ArrowRight)
                  ]),
                  _: 1
                })
              ], 2)
            ])) : createCommentVNode("", true)
          ])
        ]),
        createBaseVNode("div", {
          ref_key: "content",
          ref: content,
          class: "content"
        }, [
          renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ], 512)
      ]);
    };
  }
});
const AreaBox = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a7bf1b50"]]);
export {
  AreaBox as A
};
