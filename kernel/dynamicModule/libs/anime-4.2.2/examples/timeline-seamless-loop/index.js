import { createTimeline, utils, stagger } from '../../dist/modules/index.js';

const wrapperEl = document.querySelector('#test-wrapper');
const numberOfEls = 500;
const loopDuration = 6000;
const animDuration = loopDuration * .2;
const delay = loopDuration / numberOfEls;

let tl = createTimeline({
  defaults: {
    ease: 'inOutSine',
    loopDelay: (loopDuration * .2) - animDuration,
    duration: animDuration
  },
})
.add(wrapperEl, {
  rotate: -360,
  loop: true,
  duration: 24000,
  ease: 'linear',
})

function createEl(i) {
  let el = document.createElement('div');
  const strength = utils.round(+stagger([0, 1], {
    ease: 'inOutSine',
    reversed: true,
    from: 'center',
  })(el, i, numberOfEls), 100);
  const hue = utils.round(360 / numberOfEls * i, 2);
  const bgColor = 'hsl('+hue+',40%,60%)';
  const rotate = (360 / numberOfEls) * i;
  const translateY = '-100%';
  const scale = 1;
  el.classList.add('el');
  utils.set(el, { backgroundColor: bgColor, rotate, translateY, scale });
  tl.add(el, {
    backgroundColor: [
      {to: 'hsl('+hue+','+(40+(20*strength))+'%,'+(60+(20*strength))+'%)'},
      {to: bgColor}
    ],
    rotate: [
      {to: rotate+(10*strength)},
      {to: rotate}
    ],
    translateY: [
      {to: '-100' - (10 * strength) + '%'},
      {to: translateY}
    ],
    scale: [
      {to: [scale, scale+(.25*strength)]},
      {to: scale}
    ],
    loop: -1,
  }, delay * i);
  wrapperEl.appendChild(el);
};

for (let i = 0; i < numberOfEls; i++) createEl(i);

tl.seek(10000);