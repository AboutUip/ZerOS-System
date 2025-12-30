import {
  utils,
  animate,
  onScroll,
  stagger,
} from '../../../../dist/modules/index.js';

const isLandscapeMedia = matchMedia('(orientation: landscape)');

utils.$('.section').forEach($section => {
  animate($section.querySelectorAll('.card'), {
    rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
    transformOrigin: ['75% 75%', '75% 75%'],
    ease: 'inOut(2)',
    autoplay: onScroll({
      axis: () => isLandscapeMedia.matches ? 'x' : 'y',
      enter: () => isLandscapeMedia.matches ? 'max-=25vw start+=25vw' : 'max start',
      leave: () => isLandscapeMedia.matches ? 'min+=25vw end-=25vw' : 'min end',
      sync: .5,
      debug: true,
    }),
  });
});
