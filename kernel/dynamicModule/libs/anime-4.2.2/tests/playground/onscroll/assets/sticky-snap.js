import {
  utils,
  onScroll,
  createTimeline,
} from '../../../../dist/modules/index.js';

const tl = createTimeline({
  defaults: {
    ease: 'inOut(1)',
  },
  autoplay: onScroll({
    target: '.sticky-container',
    sync: 1,
    enter: 'top',
    leave: 'bottom',
    debug: true,
  }),
});

utils.$('.card').forEach(($card, i) => {
  tl.add($card, {
    z: [40, i],
    y: [i % 2 ? '-100vh' : '50vh', `${-i * 3}px`],
    opacity: { to: [0, 1], duration: 50 },
    rotateX: [-180, 0],
    rotateY: [utils.random(-30, 30), 0],
    rotateZ: [utils.random(-30, 30), 0],
  });
});

tl.init();
