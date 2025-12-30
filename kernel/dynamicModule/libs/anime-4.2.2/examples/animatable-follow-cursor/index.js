import {
  createAnimatable,
  utils,
  stagger,
} from '../../dist/modules/index.js';

// Setup

const [ $particles ] = utils.$('.particles');
const rows = /** @type {Number} */(utils.get($particles, '--size', false));

let w = window.innerWidth;
let h = window.innerHeight;
let hw = w / 2;
let hh = h / 2;

for (let i = 0; i < (rows * rows); i++) {
  $particles.appendChild(document.createElement('div'));
}

// Animations

const duration = stagger(50, { ease: 'in(1)', from: 'center', grid: [rows, rows] });

const particles = createAnimatable('.particles div', {
  x: { duration }, // Register the prop as animatable
  y: { duration }, // Register the prop as animatable
  rotate: { unit: 'rad', duration: 0 }, // Register the prop to be set without animation
  ease: 'outElastic(.3, 1.4)',
});

/** @param {PointerEvent} e */
window.onpointermove = e => {
  const { clientX, clientY } = e;
  particles.x(utils.mapRange(clientX, 0, w, -hw, hw));
  particles.y(utils.mapRange(clientY, 0, h, -hh, hh));
  particles.rotate(-Math.atan2(hw - clientX, hh - clientY));
}

// Responsive

window.onresize = () => {
  w = window.innerWidth;
  h = window.innerHeight;
  hw = w / 2;
  hh = h / 2;
}
