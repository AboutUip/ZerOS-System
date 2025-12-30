import {
  createTimeline,
  stagger,
  utils,
} from '../../../dist/modules/index.js';

const count = 2000;

const tl = createTimeline({
  autoplay: false,
});

for (let i = 0; i < count; i++) {
  const $el = document.createElement('div');
  const hue = Math.round(360 / count * i);
  $el.style.opacity = '.5';
  $el.style.backgroundColor = `hsl(${hue}, 60%, 60%)`;
  document.body.appendChild($el);
  tl.add($el, {
    opacity: 0,
    scale: 2,
    duration: 100,
  })
}

/**
 * @param  {MouseEvent} e [description]
 */
window.onmousemove = (e) => {
  tl.progress = e.clientX / window.innerWidth;
}