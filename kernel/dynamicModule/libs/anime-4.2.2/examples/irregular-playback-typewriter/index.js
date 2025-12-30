import {
  animate,
  createTimeline,
  utils,
  stagger,
  easings,
} from '../../dist/modules/index.js';

const $spans = utils.$('span');
const $cursor = utils.$('.cursor');
const keystrokesSteps = $spans.length - 1;
const keystrokesInterval = 125;

createTimeline({
  playbackEase: easings.irregular(keystrokesSteps, 2),
})
.set($spans, { opacity: [0, 1] }, stagger(keystrokesInterval))
.add($cursor, {
  left: '100%',
  duration: keystrokesSteps * keystrokesInterval,
  ease: easings.steps(keystrokesSteps),
}, 0)
.init();

animate($cursor, {
  opacity: 0,
  duration: 750,
  ease: 'inIn(2)',
  loop: true,
  alternate: true,
});
