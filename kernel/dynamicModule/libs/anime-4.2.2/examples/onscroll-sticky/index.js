import {
  utils,
  stagger,
  onScroll,
  createTimeline,
  animate,
} from '../../dist/modules/index.js';

utils.set('.card', {
  rotate: () => utils.random(-1, 1, 2),
  rotateZ: () => utils.random(-1, 1, 2),
  y: stagger(-.5, { from: 'last' }),
  z: stagger(1),
});

const brightness = v => `brightness(${v})`;

utils.set('.front', { filter: stagger([.75, 1], { modifier: brightness }) });
utils.set('.back',  { filter: stagger([1, .75], { modifier: brightness }) });

createTimeline({
  defaults: {
    ease: 'linear',
    duration: 500,
    composition: 'blend',
  },
  autoplay: onScroll({
    target: '.sticky-container',
    enter: 'top top',
    leave: 'bottom bottom',
    sync: .5,
    debug: true,
  }),
})
.add('.stack', {
  rotateY: [-180, 0],
  ease: 'in(2)',
}, 0)
.add('.card', {
  rotate: 0,
  rotateZ: { to: stagger([0, -360], { from: 'last' }), ease: 'inOut(2)' },
  y: { to: '-60%', duration: 400 },
  transformOrigin: ['50% 100%', '50% 50%'],
  delay: stagger(1, { from: 'first' }),
}, 0)
.init()

utils.$('.card').forEach($card => {
  $card.onmouseenter = () => animate($card, {
    y: '-70%', duration: 350, composition: 'blend',
  });
  $card.onmouseleave = () => animate($card, {
    y: '-60%', duration: 750, composition: 'blend', delay: 75,
  });
})
