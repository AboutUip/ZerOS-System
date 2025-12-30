import {
  animate,
  createScope,
  createSpring,
  createTimeline,
  stagger,
  splitText,
  utils,
} from '../../../dist/modules/index.js';

createScope({
  root: '#horizontal-split',
  defaults: {
    ease: 'outQuad',
    duration: 500,
  }
}).add((scope) => {

  const { root, methods } = scope;

  splitText('h2', {
    chars: {
      class: 'char',
      clone: 'left',
      wrap: 'clip',
    },
  });

  const rotateAnim = createTimeline({
    autoplay: false,
    defaults: { ease: 'inOutQuad', duration: 400, }
  })
  .add('.char > span', { x: '100%' }, stagger(5, { use: 'data-char' }))

  scope.add('onEnter', () => animate(rotateAnim, { progress: 1 }));
  scope.add('onLeave', () => animate(rotateAnim, { progress: 0 }));

  root.addEventListener('pointerenter', /** @type {EventListener} */(methods.onEnter));
  root.addEventListener('pointerleave', /** @type {EventListener} */(methods.onLeave));

});

createScope({
  root: '#wavy-text-effect',
  defaults: { ease: 'inOut(3)', duration: 350 },
}).add((scope) => {

  const { root } = scope;

  const params = {
    split: splitText('h2', { chars: true }),
    strength: 0,
  };

  const waveAnim = createTimeline().add(params.split.chars, {
    y: [`-50%`, `50%`],
    duration: 500,
    loop: true,
    alternate: true,
    ease: 'inOut(2)',
    autoplay: false,
    modifier: v => v * params.strength,
  }, stagger(50)).seek(1000);

  root.addEventListener('pointerenter', () => animate(params, {
    strength: 1,
    onBegin: () => waveAnim.play(),
  }));

  root.addEventListener('pointerleave', () => animate(params, {
    strength: 0,
    onComplete: () => waveAnim.pause(),
  }));

});

createScope({
  root: '#raining-letters',
}).add((scope) => {

  const { root, methods } = scope;

  splitText('h2', {
    chars: {
      class: 'char',
      clone: 'top',
      wrap: 'clip',
    },
  });

  const ease = createSpring({ stiffness: 90, damping: 11 });

  scope.add('onEnter', () => {
    createTimeline().add('.char > span', {
      y: '100%',
      composition: 'blend',
      ease,
    }, stagger(10, { use: 'data-char', from: 'random' }));
  });

  scope.add('onLeave', () => {
    createTimeline().add('.char > span', {
      y: '0%',
      composition: 'blend',
      ease,
    }, stagger(10, { use: 'data-char', from: 'random' }));
  });

  root.addEventListener('pointerenter', methods.onEnter);
  root.addEventListener('pointerleave', methods.onLeave);

});

createScope({
  root: '#subtle-highlight',
  defaults: { ease: 'out(3)', duration: 350, composition: 'blend' },
}).add((scope) => {

  const { root, methods } = scope;
  const { chars } = splitText('h2', { chars: true });

  utils.set(chars, { opacity: .25 });

  scope.add('onEnter', () => createTimeline().add(chars, { opacity: 1, textShadow: '0 0 30px rgba(255,255,255,.9)' }, stagger(12)));
  scope.add('onLeave', () => createTimeline().add(chars, { opacity: .25, textShadow: '0 0 0px rgba(255,255,255,0)' }, stagger(12)));

  root.addEventListener('pointerenter', methods.onEnter);
  root.addEventListener('pointerleave', methods.onLeave);

});

createScope({
  root: '#words-3d-jp',
  defaults: {
    ease: 'outQuad',
  }
}).add((scope) => {

  const { root, methods } = scope;

  splitText('h2', {
    words: `<span class="word-3d word-{i}">
      <em class="face face-top">{value}</em>
      <em class="face-front">{value}</em>
      <em class="face face-bottom">{value}</em>
      <em class="face face-back">{value}</em>
    </span>`,
  });

  const wordStagger = stagger(50, { use: 'data-word', start: 0 });

  const rotateAnim = createTimeline({
    autoplay: false,
    defaults: { ease: 'inOut(2)', duration: 750 }
  })
  .add('.word-3d', { rotateX: -180 }, wordStagger)
  .add('.word-3d .face-top', { opacity: [0, 0, 0] }, wordStagger)
  .add('.word-3d .face-front', { opacity: [1, 0, 0] }, wordStagger)
  .add('.word-3d .face-bottom', { opacity: [0, 1, 0] }, wordStagger)
  .add('.word-3d .face-back', { opacity: [0, 0, 1] }, wordStagger)

  scope.add('onEnter', () => animate(rotateAnim, { progress: 1 }));
  scope.add('onLeave', () => animate(rotateAnim, { progress: 0 }));

  root.addEventListener('pointerenter', /** @type {EventListener} */(methods.onEnter));
  root.addEventListener('pointerleave', /** @type {EventListener} */(methods.onLeave));

});

createScope({
  root: '#exploding-characters',
}).add((scope) => {

  const { root, methods } = scope;
  const { chars } = splitText('h2', { chars: true });

  scope.add('onEnter', () => {
    createTimeline().add(chars, {
      x: {
        to: () => utils.random(-3, 3) + 'rem',
        duration: () => utils.random(150, 500),
      },
      y: () => utils.random(-5, 5) + 'rem',
      rotate: () => utils.random(-180, 180),
      duration: () => utils.random(200, 750),
      ease: 'outCirc', composition: 'blend',
    }, stagger(5, { from: 'random' }));
  });

  scope.add('onLeave', () => {
    createTimeline().add(chars, {
      x: { to: 0, delay: 75 },
      y: 0,
      duration: () => utils.random(200, 400),
      rotate: {
        to: 0,
        delay: 150,
        duration: () => utils.random(300, 400),
      },
      ease: 'inOut(2)', composition: 'blend',
    }, stagger(10, { from: 'random' }));
  });

  root.addEventListener('pointerenter', methods.onEnter);
  root.addEventListener('pointerleave', methods.onLeave);

});