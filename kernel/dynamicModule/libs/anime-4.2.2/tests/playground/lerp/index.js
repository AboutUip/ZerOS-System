import {
  animate,
  createTimer,
  utils,
} from '../../../dist/modules/index.js';

const [ $input ] = utils.$('.input');
const [ $damped ] = utils.$('.damped');
const [ $lerped ] = utils.$('.lerped');

animate($input, {
  x: [-200, 200],
  modifier: utils.snap(100),
  duration: 2000,
  loop: true,
  alternate: true,
  ease: 'linear',
});

createTimer({
  frameRate: 10,
  onUpdate: clock => {
    const sourceX = utils.get($input, 'x', false);
    const lerpedX = utils.get($lerped, 'x', false);
    utils.set($lerped, {
      x: utils.lerp(lerpedX, sourceX, .075)
    });
  }
});

createTimer({
  frameRate: 10,
  onUpdate: clock => {
    const sourceX = utils.get($input, 'x', false);
    const lerpedX = utils.get($damped, 'x', false);
    utils.set($damped, {
      x: utils.damp(lerpedX, sourceX, clock.deltaTime, .075)
    });
  }
});

let seededRandom = utils.createSeededRandom(0);

console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);
console.log(utils.random() * -1);

console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
seededRandom = utils.createSeededRandom(0);
console.log('RESET');
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));
console.log(seededRandom(0, 10));