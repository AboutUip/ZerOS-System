import { d as defineComponent, r as ref, ad as Player, a4 as onMounted, Y as onUnmounted, y as getMusicUrl, ae as getLyric, af as parseLrc, c as createElementBlock, F as Fragment, a as createBaseVNode, b as createVNode, w as withCtx, f as createTextVNode, e as resolveComponent, o as openBlock, B as toDisplayString, ag as LyricDisplay, ah as animation, k as createBlock, L as createCommentVNode } from "./index-DUNGDuLl.js";
const _hoisted_1$2 = ["src"];
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "yrc1",
  setup(__props) {
    const ids = [
      186005,
      1859245776,
      512621132,
      1367900235,
      17793611,
      26499472,
      1382576173,
      1382781549,
      491294478,
      2131317056,
      5249178,
      1297498908,
      2130074493,
      33340727,
      1913874332,
      38019092,
      1819100221,
      1887439185,
      565825902,
      19567986,
      1958557540,
      1407187587,
      28461933,
      1446828061,
      863046037,
      1334248867,
      35847559,
      34228719,
      1494752189,
      1497588709,
      434974661,
      1394847947,
      511364880,
      27583305,
      434656606,
      1451998397,
      1876395183,
      28814030,
      4173190
    ];
    const audio = ref();
    const index = ref(0);
    function isPlaying(audioElement) {
      if (!audioElement) return false;
      return !audioElement.paused && audioElement.currentTime > 0 && !audioElement.ended;
    }
    const click = (time2, i) => {
      if (!isPlaying(audio.value)) {
        audio.value?.play();
      }
      index.value = i;
      audio.value.currentTime = time2;
    };
    let player = new Player({
      click
    });
    const url = ref();
    let timer = 0;
    onMounted(() => {
      audio.value.volume = 0.2;
      player.mount(document.querySelector(".test123"), audio.value);
      init();
    });
    onUnmounted(() => {
      player.uninstall();
      player = null;
    });
    const init = async () => {
      const id = ids[timer];
      timer += 1;
      const res = await getMusicUrl(id);
      url.value = res.data[0].url;
      const res2 = await getLyric(id);
      const lrc = parseLrc(res2.yrc.lyric);
      audio.value?.play();
      player.updateAudioLrc(lrc, "lrc");
    };
    const play = () => {
      player.play();
    };
    const pause = () => {
      player.pause();
    };
    const seeked = () => {
      audio.value?.play();
      player.syncIndex();
    };
    return (_ctx, _cache) => {
      const _component_BaseButton = resolveComponent("BaseButton");
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[2] || (_cache[2] = createBaseVNode("div", { class: "test123" }, null, -1)),
        createBaseVNode("audio", {
          onSeeked: seeked,
          ref_key: "audio",
          ref: audio,
          onPlay: play,
          onPause: pause,
          controls: "",
          src: url.value
        }, null, 40, _hoisted_1$2),
        createVNode(_component_BaseButton, {
          onClick: _cache[0] || (_cache[0] = ($event) => init())
        }, {
          default: withCtx(() => [..._cache[1] || (_cache[1] = [
            createTextVNode("下一首", -1)
          ])]),
          _: 1
        })
      ], 64);
    };
  }
});
const lyric = `{"t":0,"c":[{"tx":"作词: "},{"tx":"Jake Lawson"},{"tx":"/"},{"tx":"Zac Lawson"}]}
{"t":1000,"c":[{"tx":"作曲: "},{"tx":"Jake Lawson"},{"tx":"/"},{"tx":"Zac Lawson"}]}
[15772,880](15772,169,0)It (15941,153,0)was (16094,128,0)just (16222,152,0)two (16375,277,0)lovers
[17260,3840](17260,450,0)Sittin' (17710,150,0)in (17860,90,0)the (17950,360,0)car(18310,0,0), (18310,480,0)listening (18790,90,0)to (18880,390,0)Blonde(19270,0,0), (19270,300,0)fallin' (19570,210,0)for (19780,180,0)each (19960,420,0)other(20380,720,0)
[21100,3870](21100,270,0)Pink (21370,180,0)and (21550,210,0)orange (21760,390,0)skies(22150,0,0), (22150,240,0)feelin' (22390,300,0)super (22690,570,0)childish(23260,0,0), (23260,90,0)no (23350,330,0)Donald (23680,600,0)Glover(24280,690,0)
[24970,1740](24970,180,0)Missed (25150,120,0)call (25270,180,0)from (25450,120,0)my (25570,540,0)mother(26110,600,0)
[26710,1140](26710,150,0)Like(26860,0,0), (26860,30,0)"(26890,180,0)Where (27070,180,0)you (27250,120,0)at (27370,450,0)tonight(27820,0,0)?(27820,30,0)"
[27850,2190](27850,150,0)Got (28000,210,0)no (28210,600,0)alibi(28810,0,0), (28810,120,0)I (28930,240,0)was (29170,300,0)all (29470,570,0)alone
[30040,3690](30040,330,0)With (30370,300,0)the (30670,1200,0)love (31870,90,0) (31960,330,0)of (32290,150,0)my (32440,1260,0)life(33700,30,0)
[33730,2340](33730,420,0)She's (34150,330,0)got (34480,570,0)glitter (35050,240,0)for (35290,780,0)skin
[36070,4740](36070,270,0)My (36340,990,0)radiant (37330,420,0)beam (37750,270,0)in (38020,210,0)the (38230,1860,0)night(40090,720,0)
[40810,5160](40810,270,0)I (41080,450,0)don't (41530,270,0)need (41800,270,0)no (42070,960,0)light (43030,840,0)to (43870,1230,0)see (45100,690,0)you(45790,180,0)
[45970,3990](45970,3960,0)Shine(49930,30,0)
[49960,8550](49960,990,0)It's (50950,840,0)your (51790,30,0) (51820,2070,0)golden (53890,4590,0)hour(58480,30,0)
[58510,6780](58510,840,0)You (59350,1020,0)slow (60370,960,0)down (61330,3960,0)time
[65290,11250](65290,870,0)In (66160,990,0)your (67150,990,0)golden (68140,7050,0)hour(75190,1350,0)
[76540,1950](76540,240,0)We (76780,120,0)were (76900,240,0)just (77140,90,0)two (77230,630,0)lovers(77860,630,0)
[78490,3780](78490,240,0)Feet (78730,150,0)up (78880,150,0)on (79030,90,0)the (79120,360,0)dash(79480,0,0), (79480,300,0)drivin' (79780,300,0)nowhere (80080,360,0)fast(80440,0,0), (80440,270,0)burnin' (80710,180,0)through (80890,120,0)the (81010,540,0)summer(81550,720,0)
[82270,3810](82270,540,0)Radio (82810,150,0)on (82960,360,0)blast(83320,0,0), (83320,120,0)make (83440,120,0)the (83560,360,0)moment (83920,300,0)last(84220,0,0), (84220,150,0)she (84370,180,0)got (84550,270,0)solar (84820,750,0)power(85570,510,0)
[86080,1860](86080,390,0)Minutes (86470,180,0)feel (86650,180,0)like (86830,540,0)hours(87370,570,0)
[87940,1080](87940,270,0)She (88210,120,0)knew (88330,180,0)she (88510,150,0)was (88660,60,0)the (88720,300,0)baddest
[89020,2190](89020,180,0)Can (89200,150,0)you (89350,270,0)even (89620,360,0)imagine (89980,300,0)fallin' (90280,360,0)like (90640,90,0)I (90730,480,0)did(91210,0,0)?
[91210,3690](91210,330,0)For (91540,300,0)the (91840,1200,0)love (93040,90,0) (93130,330,0)of (93460,150,0)my (93610,1260,0)life(94870,30,0)
[94900,2430](94900,420,0)She's (95320,330,0)got (95650,300,0)glow (95950,450,0)on (96400,120,0)her (96520,810,0)face
[97330,4620](97330,150,0)A (97480,1080,0)glorious (98560,360,0)look (98920,330,0)in (99250,330,0)her (99580,1320,0)eyes(100900,1050,0)
[101950,3210](101950,330,0)My (102280,780,0)angel (103060,90,0)of (103150,1980,0)light(105130,30,0)
[105160,5040](105160,210,0)I (105370,210,0)was (105580,300,0)all (105880,540,0)alone (106420,360,0)with (106780,300,0)the (107080,1350,0)love (108430,270,0)of (108700,150,0)my (108850,1320,0)life(110170,30,0)
[110200,2250](110200,360,0)She's (110560,300,0)got (110860,660,0)glitter (111520,180,0)for (111700,750,0)skin
[112450,4860](112450,270,0)My (112720,990,0)radiant (113710,420,0)beam (114130,240,0)in (114370,240,0)the (114610,1020,0)night(115630,1680,0)
[117310,4860](117310,180,0)I (117490,420,0)don't (117910,300,0)need (118210,270,0)no (118480,960,0)light (119440,840,0)to (120280,1110,0)see (121390,600,0)you(121990,180,0)
[122170,4020](122170,3960,0)Shine(126130,60,0)
[126190,8490](126190,960,0)It's (127150,810,0)your (127960,30,0) (127990,2100,0)golden (130090,4560,0)hour(134650,30,0)
[134680,6780](134680,870,0)You (135550,1080,0)slow (136630,900,0)down (137530,3930,0)time
[141460,67790](141460,900,0)In (142360,990,0)your (143350,330,0)golden (143680,32580,0)hour(176260,32990,0)
`;
const _hoisted_1$1 = { style: { "position": "absolute", "z-index": "999" } };
const _hoisted_2 = ["src"];
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "yrc2",
  setup(__props) {
    const lyr = ref([]);
    const currentLyrLine = ref({ time: 0, line: 1, text: "0" });
    const audio = ref();
    const url = ref("");
    let stepIndex = 0;
    const time = ref();
    const currentYrc = ref({});
    const arrive = ref({});
    function isPlaying(audioElement) {
      if (!audioElement) return false;
      return !audioElement.paused && audioElement.currentTime > 0 && !audioElement.ended;
    }
    const init = () => {
      lyr.value = parseLrc(lyric);
      getMusicUrl("186004").then((res) => {
        url.value = res.data[0].url;
      });
    };
    init();
    let id;
    const step = () => {
      if (!isPlaying(audio.value)) {
        return;
      }
      const currentTime = parseFloat(audio.value.currentTime.toFixed(2));
      time.value = currentTime;
      currentYrc.value = stepIndex !== 0 ? lyr.value[stepIndex - 1] : {};
      if (currentTime >= lyr.value[stepIndex].time) {
        currentLyrLine.value = lyr.value[stepIndex];
        stepIndex++;
        arrive.value = currentTime;
        alone(stepIndex - 1);
      }
    };
    id = setInterval(step, 1);
    function alone(i) {
      let itemIndex = 0;
      let index = i;
      console.log("=======达到下一行=======");
      start();
      function start() {
        if (itemIndex > lyr.value[index].yrc.length - 1) {
          itemIndex = 0;
          index++;
          return;
        }
        const current = lyr.value[index].yrc[itemIndex];
        let delayTime = 0;
        if (parseFloat(audio.value.currentTime.toFixed(2)) - current.cursor <= 0) ;
        else {
          delayTime = (parseFloat(audio.value.currentTime.toFixed(2)) - current.cursor) * 1e3;
        }
        const transition = lyr.value[index].yrc[itemIndex].transition * 1e3 - delayTime;
        const pause = animation(transition, (elapsed, done) => {
          current.width = elapsed / transition * 100 + "%";
          if (done) {
            console.log(`
              '歌曲时间:', ${parseFloat(audio.value.currentTime.toFixed(2))},
              '字的到达时间:', ${current.cursor}
              '字的结束时间:', ${current.cursor + current.transition}
              '延迟时间:', ${parseFloat(audio.value.currentTime.toFixed(2)) - (current.cursor + current.transition)}
          `);
            pause(true);
            itemIndex++;
            start();
          }
        });
      }
    }
    onUnmounted(() => {
      clearInterval(id);
    });
    return (_ctx, _cache) => {
      const _component_base_button = resolveComponent("base-button");
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1$1, [
          createBaseVNode("audio", {
            ref_key: "audio",
            ref: audio,
            controls: "",
            src: url.value
          }, null, 8, _hoisted_2),
          createBaseVNode("h2", null, "当前时间：" + toDisplayString(time.value), 1),
          createBaseVNode("h2", null, "下一个时间：" + toDisplayString(currentYrc.value.time || "0"), 1),
          createBaseVNode("h2", null, "达到时的时间：" + toDisplayString(arrive.value), 1),
          createBaseVNode("h2", null, "延迟时间：" + toDisplayString(arrive.value - currentYrc.value.time) + "s", 1),
          createVNode(_component_base_button, {
            onClick: _cache[0] || (_cache[0] = () => audio.value.currentTime = 30)
          }, {
            default: withCtx(() => [..._cache[1] || (_cache[1] = [
              createTextVNode("111", -1)
            ])]),
            _: 1
          })
        ]),
        createVNode(LyricDisplay, {
          lrcMode: 1,
          lyric: lyr.value,
          currentLyrLine: currentLyrLine.value,
          "is-blur": false
        }, null, 8, ["lyric", "currentLyrLine"])
      ], 64);
    };
  }
});
const _hoisted_1 = { style: { "position": "absolute", "z-index": "999", "left": "0", "top": "50%" } };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "YrcTest",
  setup(__props) {
    const val = ref("yrc1");
    const click = (msg) => {
      val.value = msg;
    };
    return (_ctx, _cache) => {
      const _component_base_button = resolveComponent("base-button");
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1, [
          createVNode(_component_base_button, {
            onClick: _cache[0] || (_cache[0] = ($event) => click("yrc1"))
          }, {
            default: withCtx(() => [..._cache[2] || (_cache[2] = [
              createTextVNode("yrc1", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_base_button, {
            onClick: _cache[1] || (_cache[1] = ($event) => click("yrc2"))
          }, {
            default: withCtx(() => [..._cache[3] || (_cache[3] = [
              createTextVNode("yrc2", -1)
            ])]),
            _: 1
          })
        ]),
        val.value === "yrc1" ? (openBlock(), createBlock(_sfc_main$2, { key: 0 })) : val.value === "yrc2" ? (openBlock(), createBlock(_sfc_main$1, { key: 1 })) : createCommentVNode("", true)
      ], 64);
    };
  }
});
export {
  _sfc_main as default
};
