import { d as defineComponent, A as reactive, c as createElementBlock, a as createBaseVNode, B as toDisplayString, o as openBlock, a9 as useSettings, t as useUserInfo, r as ref, b as createVNode, k as createBlock, L as createCommentVNode, w as withCtx, l as unref, e as resolveComponent, aa as isElectron, f as createTextVNode, ab as mergeProps, P as ElMessage, ac as checkUrlValidity, _ as _export_sfc } from "./index-DUNGDuLl.js";
const _hoisted_1$1 = { class: "versions" };
const _hoisted_2 = { class: "electron-version" };
const _hoisted_3 = { class: "chrome-version" };
const _hoisted_4 = { class: "node-version" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "Versions",
  setup(__props) {
    const versions = reactive({ ...window.electron.process.versions });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("ul", _hoisted_1$1, [
        createBaseVNode("li", _hoisted_2, "Electron v" + toDisplayString(versions.electron), 1),
        createBaseVNode("li", _hoisted_3, "Chromium v" + toDisplayString(versions.chrome), 1),
        createBaseVNode("li", _hoisted_4, "Node v" + toDisplayString(versions.node), 1),
        _cache[0] || (_cache[0] = createBaseVNode("li", { class: "node-version" }, "Music v1.0", -1))
      ]);
    };
  }
});
const _hoisted_1 = { class: "padding-container" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  setup(__props) {
    const settings = useSettings();
    const store = useUserInfo();
    const snackbar = ref(false);
    const urlVerify = ref({
      message: "",
      isValid: true
    });
    let form = reactive({
      url: settings.state.baseUrl,
      font: settings.state.font
    });
    const validateUrl = (value) => {
      let result = {
        message: "",
        isValid: true
      };
      if (value === "") {
        result = {
          message: "地址不能为空",
          isValid: false
        };
        result.message = "地址不能为空";
        result.isValid = false;
      }
      result = checkUrlValidity(value);
      urlVerify.value = result;
      return result.isValid || result.message;
    };
    const setBaseUrl = () => {
      snackbar.value = true;
      settings.setState({
        baseUrl: form.url
      });
      ElMessage.success({
        message: "修改网络域成功"
      });
    };
    const updateBg = (value) => {
      settings.setState({
        lyricBg: value
      });
    };
    const updateBold = (value) => {
      settings.setState({
        bold: value
      });
      if (value) {
        document.body.classList.add("bold");
      } else {
        document.body.classList.remove("bold");
      }
    };
    const setFont = () => {
      settings.setState({
        font: form.font
      });
      const appEl = document.querySelector("#app");
      if (appEl) {
        appEl.style.fontFamily = form.font;
        ElMessage.success({
          message: "字体设置成功"
        });
      }
    };
    const recoverDefaultSettings = () => {
      settings.$reset();
    };
    const quitLogin = () => {
      localStorage.clear();
      location.reload();
    };
    return (_ctx, _cache) => {
      const _component_v_btn = resolveComponent("v-btn");
      const _component_v_btn_toggle = resolveComponent("v-btn-toggle");
      const _component_v_tooltip = resolveComponent("v-tooltip");
      const _component_v_text_field = resolveComponent("v-text-field");
      const _component_v_switch = resolveComponent("v-switch");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", null, [
          createVNode(_component_v_btn_toggle, {
            density: "compact",
            "onUpdate:modelValue": [
              updateBg,
              _cache[0] || (_cache[0] = ($event) => unref(settings).state.lyricBg = $event)
            ],
            modelValue: unref(settings).state.lyricBg
          }, {
            default: withCtx(() => [
              createVNode(_component_v_btn, {
                class: "small",
                size: "default",
                value: "rhythm"
              }, {
                default: withCtx(() => [..._cache[4] || (_cache[4] = [
                  createTextVNode("模糊背景", -1)
                ])]),
                _: 1
              }),
              createVNode(_component_v_btn, {
                size: "default",
                value: "rgb"
              }, {
                default: withCtx(() => [..._cache[5] || (_cache[5] = [
                  createTextVNode("纯色模式", -1)
                ])]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          createVNode(_component_v_tooltip, null, {
            activator: withCtx(({ props }) => [
              createVNode(_component_v_btn, mergeProps({
                class: "ma-2",
                size: "small",
                variant: "text",
                icon: "mdi-help-circle-outline"
              }, props), null, 16)
            ]),
            default: withCtx(() => [
              _cache[6] || (_cache[6] = createBaseVNode("div", null, [
                createBaseVNode("h3", null, "设置歌词页背"),
                createBaseVNode("p", null, "模糊背景：通过图片拼接的方式在四角旋转来呈现动态背景方式"),
                createBaseVNode("p", null, "纯色模式：通过取图片的两种主色调来呈现的背景颜色，对于网络环境和电脑性能支持更好")
              ], -1))
            ]),
            _: 1
          })
        ]),
        createVNode(_component_v_text_field, {
          modelValue: unref(form).url,
          "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => unref(form).url = $event),
          width: "600",
          density: "compact",
          "persistent-clear": !urlVerify.value.isValid,
          clearable: "",
          "hide-details": "auto",
          "single-line": "",
          variant: "solo-filled",
          "prepend-inner-icon": "mdi-network-pos",
          rules: [validateUrl],
          placeholder: unref(settings).state.baseUrl
        }, {
          "append-inner": withCtx(() => [
            createVNode(_component_v_btn, {
              disabled: !urlVerify.value.isValid,
              onClick: setBaseUrl,
              "base-color": "rgba(76, 175, 80, 0.8)"
            }, {
              default: withCtx(() => [..._cache[7] || (_cache[7] = [
                createTextVNode("确认", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          append: withCtx(() => [
            createVNode(_component_v_tooltip, null, {
              activator: withCtx(({ props }) => [
                createVNode(_component_v_btn, mergeProps({
                  size: "small",
                  variant: "text",
                  icon: "mdi-help-circle-outline"
                }, props), null, 16)
              ]),
              default: withCtx(() => [
                _cache[8] || (_cache[8] = createBaseVNode("div", null, [
                  createBaseVNode("p", null, "用来动态设置网络域,例如服务器ip地址可能会有变动"),
                  createBaseVNode("p", null, "注意：如果第一次没有连接上服务器，则需要重新启动应用加载")
                ], -1))
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue", "persistent-clear", "rules", "placeholder"]),
        createVNode(_component_v_text_field, {
          modelValue: unref(form).font,
          "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => unref(form).font = $event),
          width: "600",
          density: "compact",
          clearable: "",
          "hide-details": "auto",
          "single-line": "",
          variant: "solo-filled",
          "prepend-inner-icon": "mdi-format-font",
          placeholder: "设置全局字体"
        }, {
          "append-inner": withCtx(() => [
            createVNode(_component_v_btn, {
              disabled: !urlVerify.value.isValid,
              onClick: setFont,
              "base-color": "rgba(76, 175, 80, 0.8)"
            }, {
              default: withCtx(() => [..._cache[9] || (_cache[9] = [
                createTextVNode("确认", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          append: withCtx(() => [
            createVNode(_component_v_tooltip, null, {
              activator: withCtx(({ props }) => [
                createVNode(_component_v_btn, mergeProps({
                  size: "small",
                  variant: "text",
                  icon: "mdi-help-circle-outline"
                }, props), null, 16)
              ]),
              default: withCtx(() => [
                _cache[10] || (_cache[10] = createBaseVNode("div", null, [
                  createBaseVNode("p", null, "设置全局字体")
                ], -1))
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_v_switch, {
          "onUpdate:modelValue": [
            updateBold,
            _cache[3] || (_cache[3] = ($event) => unref(settings).state.bold = $event)
          ],
          modelValue: unref(settings).state.bold,
          label: "全局字体加粗"
        }, null, 8, ["modelValue"]),
        createVNode(_component_v_btn, {
          style: { "width": "110px" },
          onClick: recoverDefaultSettings,
          "base-color": "rgba(255,255,255,0.1)"
        }, {
          default: withCtx(() => [..._cache[11] || (_cache[11] = [
            createTextVNode("恢复默认设置", -1)
          ])]),
          _: 1
        }),
        unref(store).isLogin ? (openBlock(), createBlock(_component_v_btn, {
          key: 0,
          style: { "width": "110px", "margin-top": "20px" },
          onClick: quitLogin
        }, {
          default: withCtx(() => [..._cache[12] || (_cache[12] = [
            createTextVNode("退出登录", -1)
          ])]),
          _: 1
        })) : createCommentVNode("", true),
        unref(isElectron)() ? (openBlock(), createBlock(_sfc_main$1, { key: 1 })) : createCommentVNode("", true)
      ]);
    };
  }
});
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-faa254de"]]);
export {
  index as default
};
