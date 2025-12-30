import {
  animate,
  createDraggable,
  utils,
  Draggable
} from '../../../../dist/modules/index.js';

const [ $log1, $log2 ] = utils.$('.log');
const [ $container ] = /** @type {Array<HTMLElement>} */(utils.$('#container '));

const log = ($log, text) => {
  const $spans = $log.querySelectorAll('span');
  const date = new Date;
  const ms = utils.padEnd(date.getMilliseconds(), 3, '0');
  const s = utils.padEnd(date.getSeconds(), 2, '0');
  const m = utils.padEnd(date.getMinutes(), 2, '0');
  const h = utils.padEnd(date.getHours(), 2, '0');
  if ($spans.length > 300) {
    for (let i = 0; i < 200; i++) {
      $log.removeChild($spans[i]);
    }
  }
  const $el = document.createElement('span');
  $el.innerHTML = `${h}:${m}:${s}:${ms} ${text}<br>`;
  $log.appendChild($el);
  $log.scrollTop = $log.scrollHeight;
}

const manualDraggable = createDraggable('#manual', {
  velocityMultiplier: 0,
  container: '#container',
  snap: self => self.$target.offsetWidth,
  onSnap: () => log($log1, 'A onSnap'),
  onGrab: () => log($log1, 'A onGrab'),
  onDrag: () => log($log1, 'A onDrag'),
  onUpdate: () => log($log1, 'A onUpdate'),
  onRelease: () => log($log1, 'A onRelease'),
  onSettle: () => log($log1, 'A onSettle'),
  onResize: () => log($log1, 'A onResize'),
  onAfterResize: () => log($log1, 'A onAfterResize'),
});

const animatedDraggable = createDraggable('#animated', {
  container: '#container',
  onGrab: () => log($log2, 'B onGrab'),
  onDrag: () => log($log2, 'B onDrag'),
  onUpdate: () => log($log2, 'B onUpdate'),
  onRelease: () => log($log2, 'B onRelease'),
  onSettle: () => log($log2, 'B onSettle'),
  onResize: () => log($log2, 'B onResize'),
  onAfterResize: () => log($log2, 'B onAfterResize'),
});

animate(animatedDraggable, {
  x: (draggable) => {
    return $container.offsetWidth - /** @type {Draggable} */(draggable).$target.offsetWidth;
  },
  y: (draggable) => {
    return $container.offsetHeight - /** @type {Draggable} */(draggable).$target.offsetHeight * 2;
  },
});