import {
  createTimer,
  createDraggable,
  utils,
} from '../../dist/modules/index.js';

const carousel = {
  totalWidth: 0,
  itemWidth: 0,
  spacing: 0,
  released: false,
  deltaX: 0,
  deltaY: 0,
  prevX: 0,
  prevY: 0,
  wheeling: false,
  wheelable: true,
};

const [ $carousel ] = /** @type {Array<HTMLElement>} */(utils.$('.carousel'));
const carouselItems = /** @type {Array<HTMLElement>} */(utils.$('.carousel-item'));

const updateDimensions = () => {
  carousel.spacing = utils.get('#snap-carousel', '--spacing', false);
  carousel.totalWidth = carouselItems.reduce((total, $el) => {
    return total + $el.offsetWidth + carousel.spacing;
  }, 0);
  carousel.itemWidth = carouselItems[0].offsetWidth + carousel.spacing;
}

updateDimensions();

const draggable = createDraggable($carousel, {
  trigger: document.body,
  container: () => [0, 0, 0, -carousel.totalWidth + $carousel.offsetWidth - carousel.spacing],
  x: { snap: () => carousel.itemWidth },
  y: false,
  onResize: () => updateDimensions(),
  onAfterResize: self => self.setX(utils.snap(self.x, self.snapX)),
  onGrab: () => carousel.wheelable = false,
  onRelease: () => carousel.wheelable = true,
  releaseStiffness: 100,
  velocityMultiplier: 1.5,
  containerFriction: .5,
});

// Mousewheel Support

// Debouncing wheel delta calculation prevent false positives for the carousel.wheeling flag
const wheelTimer = createTimer({
  frameRate: 30,
  duration: 100,
  autoplay: false,
  onUpdate: () => {
    const newDeltaX = Math.abs(carousel.deltaX);
    const newDeltaY = Math.abs(carousel.deltaY);
    carousel.wheeling = carousel.prevY < newDeltaY || carousel.prevX < newDeltaX;
    carousel.prevX = newDeltaX;
    carousel.prevY = newDeltaY;
  }
});

const wheelVelocityTimer = createTimer({
  duration: 500,
  autoplay: false,
  onUpdate: () => {
    if (!carousel.wheelable) return;
    const [ _, cr, __, cl ] = draggable.containerBounds;
    const cf = (1 - draggable.containerFriction) * draggable.dragSpeed;
    const cx = draggable.x + carousel.deltaX + carousel.deltaY;
    // Apply friction when out of bounds
    const x = cx > cr ? cr + (cx - cr) * cf : cx < cl ? cl + (cx - cl) * cf : cx;
    const dx = x - draggable.coords[2];
    draggable.pointer[2] = draggable.pointer[0];
    draggable.pointer[4] = draggable.pointer[0];
    draggable.pointer[0] = x;
    draggable.computeVelocity(dx, 0);
    draggable.angle = 0;
  }
});

/** @param {WheelEvent} e */
function onWheel(e) {
  e.preventDefault();
  carousel.deltaX = utils.lerp(carousel.deltaX, -e.deltaX, .5);
  carousel.deltaY = utils.lerp(carousel.deltaY, -e.deltaY, .5);
  wheelTimer.restart();
  wheelVelocityTimer.restart();
  if (!carousel.wheelable) return;
  if (carousel.wheeling) {
    draggable.stop();
    draggable.setX(draggable.pointer[0], true);
    carousel.released = false;
    draggable.grabbed = true; // Needed to trigger handleUp();
  } else if (!carousel.released) {
    draggable.handleUp();
  }
}

window.addEventListener('wheel', onWheel, { passive: false });
