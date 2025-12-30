import { createTimeline, utils, createSpring } from '../../dist/modules/index.js';

const shapeEls = document.querySelectorAll('.shape');
const triangleEl = document.querySelector('.layered-animations polygon');
const points = triangleEl.getAttribute('points').split(' ').map( v => +v );
const eases = ['inOutQuad', 'inOutCirc', 'inOutSine', createSpring()];

function createKeyframes(value) {
  var keyframes = [];
  for (let i = 0; i < 100; i++) {
    keyframes.push({
      to: value,
      ease: utils.randomPick(eases),
      duration: utils.random(300, 1600)
    });
  }
  return keyframes;
}

function animateShape(el) {

  const circleEl = el.querySelector('circle');
  const rectEl = el.querySelector('rect');
  const polyEl = el.querySelector('polygon');

  const animation = createTimeline({
    onComplete: () => animateShape(el),
  })
  .add(el, {
    translateX: createKeyframes(() => utils.random(-4, 4) + 'rem'),
    translateY: createKeyframes(() => utils.random(-4, 4) + 'rem'),
    rotate: createKeyframes(() => utils.random(-180, 180)),
  }, 0)
  if (circleEl) {
    animation.add(circleEl, {
      r: createKeyframes(() => utils.random(24, 56)),
    }, 0);
  }
  if (rectEl) {
    animation.add(rectEl, {
      width: createKeyframes(() => utils.random(56, 96)),
      height: createKeyframes(() => utils.random(56, 96)),
    }, 0);
  }
  if (polyEl) {
    animation.add(polyEl, {
      points: createKeyframes(() => {
        const s = utils.random(.9, 1.6, 3);
        return `
        ${points[0]*s} ${points[1]*s} ${points[2]*s} ${points[3]*s} ${points[4]*s} ${points[5]*s}
        `;
      }),
    }, 0);
  }

  animation.init();

}

for (var i = 0; i < shapeEls.length; i++) {
  animateShape(shapeEls[i]);
}

