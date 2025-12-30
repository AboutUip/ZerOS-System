import {
  animate,
  createTimer,
  createDraggable,
  createAnimatable,
  utils,
} from '../../dist/modules/index.js';

const [ $carousel ] = /** @type {Array<HTMLElement>} */(utils.$('.carousel'));
$carousel.innerHTML += $carousel.innerHTML; // Clone the children for creating the illusion of infinity
const carouselItems = /** @type {Array<HTMLElement>} */(utils.$('.carousel-item'));

/**
 * @param  {Number} total
 * @param  {HTMLElement} $el
 * @return {Number}
 */
const getTotalWidth = (total, $el) => {
  const style= getComputedStyle($el);
  const marginsWidth = parseInt(style.marginLeft) + parseInt(style.marginRight);
  return total + $el.offsetWidth + marginsWidth;
}

const carousel = { width: carouselItems.reduce(getTotalWidth, 0), speedX: 2, wheelX: 0, wheelY: 0 };

const animatable = createAnimatable($carousel, {
  x: 0, modifier: v => utils.wrap(v, -carousel.width / 2, 0)
});

const { x } = animatable;

const draggable = createDraggable(carousel, {
  trigger: '#infinite-carousel',
  y: false,
  onGrab: () => animate(carousel, { speedX: 0, duration: 500 }),
  onRelease: () => animate(carousel, { speedX: 2, duration: 500 }),
  onResize: () => carousel.width = carouselItems.reduce(getTotalWidth, 0),
  releaseStiffness: 20,
  velocityMultiplier: 1.5
});

createTimer({
  onUpdate: () => {
    x(/** @type {Number} */(x()) - carousel.speedX + draggable.deltaX - carousel.wheelX - carousel.wheelY);
  }
});

// Support mousewheel

const wheelDeltaAnim = animate(carousel, {
  wheelY: 0, // We make sure the wheel delta always goes back to 0
  wheelX: 0, // We make sure the wheel delta always goes back to 0
  duration: 500,
  autoplay: false,
  ease: 'out(4)'
});

/**
 * @type {EventListener}
 * @param {WheelEvent} e
 */
function onWheel(e) {
  e.preventDefault();
  carousel.wheelY = utils.lerp(carousel.wheelY, e.deltaY, .2);
  carousel.wheelX = utils.lerp(carousel.wheelX, e.deltaX, .2);
  wheelDeltaAnim.refresh().restart()
}

$carousel.addEventListener('wheel', onWheel, { passive: false });
