import {
  animate,
  onScroll,
  stagger,
  createScope,
} from '../../dist/modules/index.js';

createScope({
  mediaQueries: { landscape: '(orientation: landscape)' },
  defaults: { ease: 'out(3)', duration: 500 },
}).add((scope) => {

  let cardsAnimation;

  if (scope.matches.landscape) {
    cardsAnimation = animate('.card', {
      transformOrigin: '50% 150%',
      y: {
        from: stagger(['-40vh','40vh'], {from: 'center'}),
      },
      rotate: {
        to: stagger([-30, 30]),
        delay: stagger([0, 950], { from: 'last', start: 200 }),
        ease: 'inOut(3)',
      },
      x: ['-60vw', stagger(['-20%', '20%'])],
      delay: stagger(60, { from: 'last' }),
      duration: 750,
    });
  } else {
    cardsAnimation = animate('.card', {
      y: ['150vh', stagger(['20%', '-20%'])],
      rotate: {
        from: (_, i) => i % 2 ? '-20deg' : '20deg',
        ease: 'inOut(3)',
      },
      delay: stagger(50, { from: 'last' })
    });
  }

  onScroll({
    target: '.sticky-container',
    enter: 'top',
    leave: 'bottom',
    // debug: true,
    sync: .1
  }).link(cardsAnimation)

});