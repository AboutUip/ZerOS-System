import {
  createTimeline,
  stagger,
  utils,
} from '../../dist/modules/index.js';

const count = 2024;
const duration = 10000;
const distance = 20;
const angle = utils.mapRange(0, count, 0, Math.PI * 100);

for (let i = 0; i < count; i++) {
  const $el = document.createElement('div');
  const hue = utils.round(360 / count * i, 0);
  utils.set($el, { background: `hsl(${hue}, 60%, 60%)` });
  document.body.appendChild($el);
}

createTimeline()
.add('div', {
  x: (_, i) => `${Math.sin(angle(i)) * distance}rem`,
  y: (_, i) => `${Math.cos(angle(i)) * distance}rem`,
  scale: [0, .4, .2, .9, 0],
  playbackEase: 'inOutSine',
  loop: true,
  duration,
}, stagger([0, duration]))
.init()
.seek(10000);
