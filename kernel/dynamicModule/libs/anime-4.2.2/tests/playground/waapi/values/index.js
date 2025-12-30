import { waapi, animate, stagger, utils, createTimer } from '../../../../dist/modules/index.js';

let alternate = false;
let x = utils.random(0, window.innerWidth - 800);
let y = utils.random(0, window.innerHeight - 260);
let bg = `rgb(255, 0, ${utils.random(0, 255)})`;
let rotate = stagger(alternate ? [-180, 180] : [0, 360], { grid: [10, 10], from: 'center' });
let opacityScale = stagger(alternate ? [1, 0] : [0, 1], { grid: [10, 10], from: 'center' });

const animateWAAPI = () => {
  waapi.animate('.container-A .square', {
    opacity: opacityScale,
    translate: { to: `${x}px ${y}px`, duration: 750 },
    scale: [1, opacityScale, stagger([4, 1], { grid: [10, 10], from: 'center' }), .5, 1],
    rotate: rotate,
    background: { from: bg, ease: 'inOut(2)', duration: 500 },
    ease: 'ease-out',
    duration: 1000,
    delay: stagger(100, { grid: [10, 10], from: 'center' }),
  });
}

const animateWAAPIIndividualTransforms = () => {
  waapi.animate('.container-B .square', {
    opacity: opacityScale,
    x: { to: x, duration: 750 },
    y: { to: y, duration: 750 },
    scale: [1, opacityScale, stagger([4, 1], { grid: [10, 10], from: 'center' }), .5, 1],
    rotate: rotate,
    background: { from: bg, ease: 'inOut(2)', duration: 500 },
    ease: 'ease-out',
    duration: 1000,
    delay: stagger(100, { grid: [10, 10], from: 'center' }),
  });
}

const animateJS = () => {
  animate('.container-C .square', {
    opacity: opacityScale,
    x: { to: x, duration: 750 },
    y: { to: y, duration: 750 },
    scale: [1, opacityScale, stagger([4, 1], { grid: [10, 10], from: 'center' }), .5, 1],
    rotate: rotate,
    background: { from: bg, ease: 'inOut(2)', duration: 500 },
    ease: 'out',
    // composition: 'blend',
    duration: 1000,
    delay: stagger(100, { grid: [10, 10], from: 'center' }),
  });
}

const animateAll = () => {
  x = utils.random(0, window.innerWidth - 800);
  y = utils.random(0, window.innerHeight - 260);
  bg = `rgb(255, 0, ${utils.random(0, 255)})`;
  rotate = stagger(alternate ? [-180, 180] : [0, 360], { grid: [10, 10], from: 'center' });
  opacityScale = stagger(alternate ? [1, 0] : [0, 1], { grid: [10, 10], from: 'center' });
  animateWAAPI();
  animateWAAPIIndividualTransforms();
  animateJS();
  alternate = !alternate;
}

setTimeout(() => {
  animateAll();
  createTimer({
    duration: 1500,
    loop: true,
    onLoop: () => animateAll()
  })
}, 500);