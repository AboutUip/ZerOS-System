import {
  utils,
  onScroll,
  createTimeline,
  animate,
} from '../../../../dist/modules/index.js';

animate('#edges .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#edges .container',
    enter: 'bottom top',
    leave: 'top bottom',
    sync: 1,
    debug: true
  })
})

animate('#edges-inverted .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#edges-inverted .container',
    enter: 'top bottom',
    leave: 'bottom top ',
    sync: 1,
    debug: true
  })
})

animate('#offsets .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#offsets .container',
    enter: 'bottom-=100 top+=20',
    leave: 'top+=100 bottom-=20',
    sync: 1,
    debug: true
  })
})

animate('#hori-edges .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#hori-edges .container',
    axis: 'x',
    enter: 'bottom top',
    leave: 'top bottom',
    sync: 1,
    debug: true
  })
})

animate('#hori-edges-inverted .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#hori-edges-inverted .container',
    axis: 'x',
    enter: 'top bottom',
    leave: 'bottom top',
    sync: 1,
    debug: true
  })
})

animate('#hori-offsets .target', {
  rotate: 360,
  autoplay: onScroll({
    container: '#hori-offsets .container',
    axis: 'x',
    enter: 'right-=120 left+=20',
    leave: 'left+=120 right-=20',
    sync: 1,
    debug: true
  })
})
