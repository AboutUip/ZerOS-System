import {
  utils,
  animate,
  onScroll,
  stagger,
} from '../../../../dist/modules/index.js';

// Sync

const sections = utils.$('section');
const colors = ['#FF4B4B', '#A4FF4F', '#33B3F1', '#FF4FCF'];

 sections.forEach(($section, i) => {
  animate($section.querySelectorAll('.card'), {
    z: [i * 10, i * 10],
    rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
    transformOrigin: ['75% 75%', '75% 75%'],
    ease: 'inOut(1)',
    autoplay: onScroll({
      sync: true,
      debug: true,
      enter: 'max start',
      leave: 'min end',
    }),
  });

  onScroll({
    target: $section,
    debug: true,
    enter: 'max center',
    leave: 'min center',
    onEnter: self => {
      animate(document.body, {
        backgroundColor: colors[i],
      });
    }
  });
});
