import { waapi, animate, stagger, createSpring, utils, eases, engine } from '../../../../dist/modules/index.js';

let currentY = 0;
let alternate = false;

/**
 * @param  {MouseEvent} e
 */
const animateSquares = (e) => {
  const X = e.offsetX;
  const Y = e.offsetY;
  const duration = alternate ? 500 : 3000;
  waapi.animate('.container-A .square', {
    translate: `${X}px ${Y}px`,
    opacity: { to: () => utils.random(.1, 1, 3), duration: () => utils.random(500, 4000, 0) },
    scale: { to: () => utils.random(.1, 2, 3), duration: () => utils.random(500, 4000, 0) },
    // rotate: { to: () => utils.random(-180, 180, 2) + 'deg', duration: () => utils.random(500, 4000, 0) },
    // ease: createSpring({ stiffness: utils.clamp(Math.abs(currentY - Y) * .5, 100, 200) }),
    duration,
    ease: 'out',
    delay: stagger(24, { grid: [10, 10], from: 'center' }),
  });
  waapi.animate('.container-B .square', {
    x: X,
    y: Y,
    opacity: { to: () => utils.random(.1, 1, 3), duration: () => utils.random(500, 4000, 0) },
    scale: { to: () => utils.random(.1, 2, 3), duration: () => utils.random(500, 4000, 0) },
    // rotate: { to: () => utils.random(-180, 180, 2) + 'deg', duration: () => utils.random(500, 4000, 0) },
    // ease: createSpring({ stiffness: utils.clamp(Math.abs(currentY - Y) * .5, 100, 200) }),
    duration,
    ease: 'out',
    delay: stagger(24, { grid: [10, 10], from: 'center' }),
  });

  const jsAnimation = animate('.container-C .square', {
    x: X,
    y: Y,
    opacity: { to: () => utils.random(.1, 1, 3), duration: () => utils.random(500, 4000, 0) },
    scale: { to: () => utils.random(.1, 2, 3), duration: () => utils.random(500, 4000, 0) },
    // rotate: { to: () => utils.random(-180, 180, 2) + 'deg', duration: () => utils.random(500, 4000, 0) },
    // ease: createSpring({ stiffness: utils.clamp(Math.abs(currentY - Y) * .5, 100, 200) }),
    duration,
    ease: 'out',
    delay: stagger(24, { grid: [10, 10], from: 'center' }),
    // composition: 'blend',
  });
  currentY = Y;
  alternate = !alternate;
}

document.onclick = animateSquares;

// const wait = () => new Promise((res) => setTimeout(() => res(), 0));
// async function timeWaster() {
//   let x = 0n;
//   while (true) {
//     x++;
//     if (x % 10000000n === 0n) {
//       await wait();
//     }
//   }
// }
// timeWaster()