import {
  svg,
  animate,
  createTimeline,
  stagger,
  utils,
} from '../../dist/modules/index.js';

const line = svg.createDrawable('line');

createTimeline({
  loop: true,
  defaults: {
    ease: 'inOut(3)',
    duration: 2000,
  }
})
.add('#views', {
  opacity: [0, 1],
  duration: 500,
}, 0)
.add('#b', {
  x: [0, 0],
  width: [0, 900],
}, 0)
.add('#count', {
  innerHTML: { from:  0 },
  modifier: v => utils.round(v, 0).toLocaleString(),
}, '<<')
.add('#b', {
  x: 900,
  width: 0,
  duration: 1500,
}, '+=500')
.add('#views', {
  opacity: 0,
  duration: 1500,
}, '<<')
.init()
