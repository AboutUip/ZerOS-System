import { animate, createTimer, createTimeline, eases, stagger, utils } from '../../../../dist/modules/index.js';

// import { inspect } from '../../../lib/gui/index.js';


const A = animate('.square:nth-child(1)', { x: 200, onBegin: () => console.log('A BEGAN'), onComplete: () => console.log('A COMPLETE') })
const B = animate('.square:nth-child(2)', { x: 200, onBegin: () => console.log('B BEGAN'), onComplete: () => console.log('B COMPLETE') })
const C = animate('.square:nth-child(3)', { x: 200, onBegin: () => console.log('C BEGAN'), onComplete: () => console.log('C COMPLETE') })
const rotateAll = animate('.square', { rotate: 360 })

const TL = createTimeline({
  loop: true,
  alternate: true
})
.sync(A)
.sync(B, '-=500')
.sync(C, '-=500')
.sync(rotateAll, 0)

const timer = createTimer({
  onUpdate: self => console.log(self.currentTime)
})

createTimeline({
  loop: true,
})
.sync(TL)
.sync(timer, 0)
