import { animate, createTimer, utils } from '../../dist/modules/index.js';

const canvasEl = document.querySelector('canvas');
const ctx = canvasEl.getContext('2d', { alpha: false });
const maxParticules = Number(location.href.split('?')[1]) || 4000;
const colors = ['#FF4B4B','#FF8F42','#FFC730','#F6FF56'];
const viewport = { width: 0, height: 0 };
const particules = [];
const squarePi = 2 * 2 * Math.PI;

function setCanvasSize() {
  const { innerWidth, innerHeight } = window;
  const ratio = 2;
  canvasEl.width = innerWidth * ratio;
  canvasEl.height = innerHeight * ratio;
  canvasEl.style.width = innerWidth + 'px';
  canvasEl.style.height = innerHeight + 'px';
  canvasEl.getContext('2d').scale(ratio, ratio);
  viewport.width = innerWidth;
  viewport.height = innerHeight;
}

function createParticule(x, y) {
  return {
    x,
    y,
    color: utils.randomPick(colors),
    radius: 1,
  }
}

function drawParticule(p) {
  ctx.beginPath();
  ctx.fillStyle = p.color;
  ctx.arc(p.x, p.y, p.radius, 0, squarePi, true);
  ctx.fill();
}

setCanvasSize();
window.addEventListener('resize', setCanvasSize);

function animateParticule(p, i) {
  const newX = utils.random(0, viewport.width);
  const diffX = newX - p.x;
  const durX = Math.abs(diffX * 20);
  const newY = utils.random(0, viewport.height);
  const diffY = newY - p.y;
  const durY = Math.abs(diffY * 20);
  animate(p, {
    x: { to: newX, duration: durX },
    y: { to: newY, duration: durY },
    radius: utils.random(2, 6),
    ease: 'out(1)',
    onComplete: () => { animateParticule(p, i); }
  });
}

for (let i = 0; i < maxParticules; i++) {
  const p = createParticule(viewport.width * .5, viewport.height * .5);
  particules.push(p);
  animateParticule(p, i);
}

createTimer({
  onUpdate: self => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = .1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < maxParticules; i++) {
      drawParticule(particules[i]);
    }
  },
})

