import {
  animate,
  onScroll,
  utils,
} from '../../../../dist/modules/index.js';

utils.set('.section', {
  rotate: () => utils.random(-45, 45),
});

utils.set('svg.logo', {
  scale: .5,
});

animate('svg.logo', {
  scale: 2,
  ease: 'inOut(2)',
  autoplay: onScroll({
    axis: 'y',
    enter: 'max-=25% start',
    leave: 'min+=25% end',
    sync: .5,
    debug: true,
  }),
});
