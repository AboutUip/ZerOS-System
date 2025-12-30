import {
  animate,
} from '../../../dist/modules/index.js';

const easeOut = 'cubicBezier(0, 0, 0.58, 1)';
const easeIn = 'cubicBezier(0.42, 0, 1, 1)';

// const easeOut = 'out(1.64)';
// const easeIn = 'in(1.64)';

// const easeOut = 'out';
// const easeIn = 'in';

const $css = document.querySelector('.css').classList.add('is-animated');

document.querySelector('.waapi').animate([
  { offset: 0, left: '0rem', top: '0rem' },
  { offset: .3, left: '0rem', top: '-2.5rem', rotate: '45deg', easing: 'ease-out' },
  { offset: .4, left: '17rem', top: '-2.5rem' },
  { offset: .5, left: '17rem', top: '2.5rem', rotate: '90deg' },
  { offset: .7, left: '0rem', top: '2.5rem' },
  { offset: 1, left: '0rem', top: '0rem', rotate: '180deg', easing: 'ease-out' },
], {
  duration: 4000,
  easing: 'linear',
  fill: 'forwards',
  iterations: Infinity,
});

animate('.anime', {
  keyframes: {
    '0%'  : { x: '0rem', y: '0rem' },
    '30%' : { x: '0rem', y: '-2.5rem', rotate: 45, ease: easeOut },
    '40%' : { x: '17rem', y: '-2.5rem' },
    '50%' : { x: '17rem', y: '2.5rem', rotate: 90 },
    '70%' : { x: '0rem', y: '2.5rem' },
    '100%': { x: '0rem', y: '0rem', rotate: 180, ease: easeOut }
  },
  duration: 4000, // the duration is devided by the total number of keyframes (4000 / 5 = 800)
  // ease: 'inOut', // this ease is applied to all keyframes without an ease parameter defined
  ease: 'linear',
  loop: true,
});