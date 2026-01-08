import { d as defineComponent, r as ref, c as createElementBlock, a as createBaseVNode, b as createVNode, w as withCtx, e as resolveComponent, f as createTextVNode, o as openBlock, g as getUserAccountFn, s as sendCodePhone, h as codeLogin, _ as _export_sfc } from "./index-DUNGDuLl.js";
const _hoisted_1 = { style: { "display": "flex", "justify-content": "center" } };
const _hoisted_2 = { class: "test" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "test2",
  setup(__props) {
    const phone = ref("");
    const code = ref("");
    const getUserAccountHandler = () => {
      getUserAccountFn();
    };
    const sendPhoneHandler = () => {
      sendCodePhone(phone.value);
    };
    const loginHandler = () => {
      codeLogin(phone.value, code.value).then((data) => {
      });
    };
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input = resolveComponent("el-input");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createVNode(_component_el_button, { onClick: getUserAccountHandler }, {
            default: withCtx(() => [..._cache[2] || (_cache[2] = [
              createTextVNode("获取账号信息", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_input, {
            placeholder: "输入手机号",
            modelValue: phone.value,
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => phone.value = $event)
          }, null, 8, ["modelValue"]),
          createVNode(_component_el_input, {
            placeholder: "输入验证码",
            modelValue: code.value,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => code.value = $event)
          }, null, 8, ["modelValue"]),
          createVNode(_component_el_button, {
            onClick: sendPhoneHandler,
            type: "primary"
          }, {
            default: withCtx(() => [..._cache[3] || (_cache[3] = [
              createTextVNode("发送验证码", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_button, {
            onClick: loginHandler,
            type: "primary"
          }, {
            default: withCtx(() => [..._cache[4] || (_cache[4] = [
              createTextVNode("登录", -1)
            ])]),
            _: 1
          })
        ])
      ]);
    };
  }
});
const test2 = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4794c317"]]);
export {
  test2 as default
};
