import { animate, svg } from '../../../dist/modules/index.js';

animate(['.no-specified-width .dom-el', '.no-specified-width .rect-el'], {
  duration: 3000,
  loop: true,
  ease: 'linear',
  ...svg.createMotionPath('#noSpecifiedWidth')
});

animate(['.specified-width .dom-el', '.specified-width .rect-el'], {
  duration: 3000,
  loop: true,
  ease: 'linear',
  ...svg.createMotionPath('#specifiedWidth')
});

animate(['.preserveAspectRatio .dom-el', '.preserveAspectRatio .rect-el'], {
  duration: 3000,
  loop: true,
  ease: 'linear',
  ...svg.createMotionPath('#preserveAspectRatio')
});
