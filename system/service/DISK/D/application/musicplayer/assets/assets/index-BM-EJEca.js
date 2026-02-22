import { d as defineComponent, c as createElementBlock, a as createBaseVNode, b as createVNode, w as withCtx, e as resolveComponent, F as Fragment, f as createTextVNode, o as openBlock } from "./index-DUNGDuLl.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const resetApp = () => {
      window.electronAPI.reset();
    };
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[2] || (_cache[2] = createBaseVNode("h1", null, "私人FM", -1)),
        createVNode(_component_el_button, {
          style: { "width": "80px", "margin-left": "20px" },
          onClick: _cache[0] || (_cache[0] = ($event) => resetApp())
        }, {
          default: withCtx(() => [..._cache[1] || (_cache[1] = [
            createTextVNode("重启app", -1)
          ])]),
          _: 1
        })
      ], 64);
    };
  }
});
export {
  _sfc_main as default
};
