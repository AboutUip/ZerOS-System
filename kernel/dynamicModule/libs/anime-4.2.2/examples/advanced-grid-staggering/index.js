import { createTimeline, utils, stagger } from '../../dist/modules/index.js';

const staggerVisualizerEl = document.querySelector('.stagger-visualizer');
const fragment = document.createDocumentFragment();
const rows = +utils.get(document.body, '--rows');
const grid = [rows, rows];
const numberOfElements = rows * rows;
var animation;

for (let i = 0; i < numberOfElements; i++) {
  const dotEl = document.createElement('div');
  dotEl.classList.add('dot');
  fragment.appendChild(dotEl);
}

staggerVisualizerEl.appendChild(fragment);

let index = utils.random(0, numberOfElements);
let nextIndex = 0;

utils.set('.cursor', {
  x: stagger('-1rem', {grid, from: index, axis: 'x'}),
  y: stagger('-1rem', {grid, from: index, axis: 'y'})
});

function animateGrid() {

  if (animation) animation.pause();

  nextIndex = utils.random(0, numberOfElements);

  animation = createTimeline({
    defaults: {
      ease: 'inOutQuad',
    },
    onComplete: animateGrid
  })
  .add('.cursor', {
    keyframes: [
      { scale: .625 },
      { scale: 1.125 },
      { scale: 1 }
    ],
    duration: 600
  })
  .add('.dot', {
    keyframes: [
      {
        x: stagger('-.175rem', {grid, from: index, axis: 'x'}),
        y: stagger('-.175rem', {grid, from: index, axis: 'y'}),
        duration: 200
      }, {
        x: stagger('.125rem', {grid, from: index, axis: 'x'}),
        y: stagger('.125rem', {grid, from: index, axis: 'y'}),
        scale: 2,
        duration: 500
      }, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 600,
      }
    ],
    delay: stagger(50, {grid, from: index}),
  }, 0)
  .add('.cursor', {
    x: { from: stagger('-1rem', {grid, from: index, axis: 'x'}), to: stagger('-1rem', {grid, from: nextIndex, axis: 'x'}), duration: utils.random(800, 1200) },
    y: { from: stagger('-1rem', {grid, from: index, axis: 'y'}), to: stagger('-1rem', {grid, from: nextIndex, axis: 'y'}), duration: utils.random(800, 1200) },
    ease: 'outCirc'
  }, '-=1500')

  index = nextIndex;

}

animateGrid();
