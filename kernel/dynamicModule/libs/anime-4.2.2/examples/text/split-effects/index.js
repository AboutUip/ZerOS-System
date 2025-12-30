import {
  animate,
  createTimeline,
  stagger,
  splitText,
  utils,
} from '../../../dist/modules/index.js';

const coords = [];
const [ $revert ] = utils.$('#revert');
const [ $split ] = utils.$('#split');
const [ $reorder ] = utils.$('#reorder');
const [ $debug ] = utils.$('#debug');

$revert.disabled = true;
$split.disabled = false;
$reorder.disabled = true;

let split;

const splitAndAnimate = () => {
  $revert.disabled = false;
  $split.disabled = true;

  split = splitText('p', {
    lines: true,
  });

  split.addEffect(split => {
    // Returning the timeline syncs it with the splitter between lines split
    return createTimeline({
      defaults: {
        alternate: true,
        loop: true,
        loopDelay: 75,
        duration: 1500,
        ease: 'inOutQuad',
      },
    })
    .add(split.lines, {
      color: { from: '#61C3FF' },
      y: -10,
      scale: 1.1,
    }, stagger(100, { start: 0 }))
    .add(split.words, {
      scale: [.98, 1.04],
    }, stagger(100, { use: 'data-line', start: 0 }))
    .init()
  });

  split.addEffect(split => {
    split.words.forEach(($el, i) => {
      const c = coords[i];
      if (c) utils.set($el, { x: c.x, y: c.y });
      $el.addEventListener('pointerenter', () => {
        $reorder.disabled = false;
        animate($el, {
          x: utils.random(-50, 50),
          y: utils.random(-50, 50),
        })
      });
    });
    return () => {
      // Store the words coordinates before the new split
      split.words.forEach((w, i) => coords[i] = { x: utils.get(w, 'x'), y: utils.get(w, 'y') });
    }
  });
}

splitAndAnimate();

$revert.addEventListener('click', () => {
  split.revert();
  coords.length = 0;
  $revert.disabled = true;
  $split.disabled = false;
});

$split.addEventListener('click', splitAndAnimate);

$reorder.addEventListener('click', () => {
  animate(split.words, {
    x: 0, y: 0, ease: 'inOutExpo'
  });
  $reorder.disabled = true;
});

$debug.addEventListener('click', () => {
  split.debug = !split.debug;
  split.refresh();
  $debug.innerText = split.debug ? 'HIDE DEBUG' : 'SHOW DEBUG';
});
