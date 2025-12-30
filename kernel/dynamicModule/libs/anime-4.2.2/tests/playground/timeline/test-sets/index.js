import { createTimeline, stagger, utils, engine, animate } from '../../../../dist/modules/index.js';

// import { createTimeline, stagger, utils, engine, animate } from '../../assets/js/anime.esm.js';
// import { inspect } from '../../../lib/gui/index.js';

const [ $square ] = utils.$('.square');

// let call1Log = 0;
// let call2Log = 0;
// let call3Log = 0;
// let call4Log = 0;

// const tl = createTimeline({
//   // loop: 2,
//   // autoplay: false,
//   // onUpdate: e => console.log(e.progress),
//   alternate: true,
//   loop: 2,
//   // loopDelay: 1000,
//   defaults: {
//     ease: 'linear',
//     // duration: 250
//   }
// })
// .call(() => console.log(`BEGIN: ${++call1Log}`), 0)
// .call(() => console.log(`MID: ${++call2Log}`), 250)
// .call(() => console.log(`UP: ${++call3Log}`), 1000)
// .call(() => console.log(`END: ${++call4Log}`), 2000)
// .set('.square', { backgroundColor: '#FF0000' }, 0)
// .set('.square', { backgroundColor: '#00FF00' }, 1000)
// .set('.square', { backgroundColor: '#0000FF' }, 2000)
// .add('.square', {
//   rotate: 180,
//   duration: 1000,
//   // onBegin: () => {
//   //   console.log('begin');
//   // },
//   // onComplete: () => {
//   //   console.log('complete');
//   // },
// }, 0)
// .init();

const [ $el ] = utils.$('#timeline-test');

utils.set($el, { '--x': '-2px' });

const delay = 0;

const speed = 1;

const triggerCB = (e) => {
  console.log(`${e.id}`)
}

// let time = 0;

let timer1Log = 0;
let timer2Log = 0;
let timer3Log = 0;
const tl = createTimeline({ autoplay: true, loop: 3, alternate: true })
.call(() => { timer1Log += 1; console.log('1') }, 0)
.call(() => { timer2Log += 1; console.log('2') }, 100)
.call(() => { timer3Log += 1; console.log('3') }, 200);

// tl.seek(100);
// tl.seek(0);
// tl.seek(50);
// tl.seek(2000);
// tl.seek(200);


// tl.seek(0);

// console.log(timer1Log);

// inspect(tl);

// let tlOnBeginCheck = 0;
// let tlOnCompleteCheck = 0;
// let child1OnBeginCheck = 0;
// let child1OnCompleteCheck = 0;
// let child2OnBeginCheck = 0;
// let child2OnCompleteCheck = 0;

// const tl = createTimeline({
//   loop: Infinity,
//   alternate: true,
//   defaults: {
//     ease: 'linear',
//     reversed: true,
//     duration: 250
//   },
//   // autoplay: false,
//   onBegin: () => { tlOnBeginCheck += 1; },
//   onComplete: () => { tlOnCompleteCheck += 1; },
// })
// .add('.square:nth-child(1)', {
//   y: 100,
//   onBegin: () => { console.log('child 1 BEGIN'); child1OnBeginCheck += 1; },
//   onComplete: () => { console.log('child 1 COMPLETE'); child1OnCompleteCheck += 1; }
// })
// .add('.square:nth-child(2)', {
//   id: 'id-2',
//   y: 100,
//   onBegin: () => { console.log('child 2 BEGIN'); child2OnBeginCheck += 1; },
//   onComplete: () => { console.log('child 2 COMPLETE'); child2OnCompleteCheck += 1; }
// })
// .init();

// console.log(tl);

// tl.seek(2000);

// tl.seek(5);
// tl.seek(10);
// tl.seek(100);
// tl.seek(110);
// tl.seek(201)

// inspect(tl);

// tl.seek(5);
// tl.seek(10);
// tl.seek(100);
// tl.seek(110);
// tl.seek(200);
// tl.seek(380);
// tl.seek(410);
// tl.seek(450);
// console.log(tl.duration, tlOnCompleteCheck);


// const tl2 = createTimeline({
//   autoplay: false,
//   loop: 2,
//   defaults: {
//     duration: 100,
//     ease: 'linear',
//   }
// })
// .add('.square:nth-child(1)', { translateY: 100 })
// .add('.square:nth-child(1)', { opacity: 0 })
// .add('.square:nth-child(2)', { translateY: 100 })
// .add('.square:nth-child(2)', { opacity: 0 })

// inspect(tl2);