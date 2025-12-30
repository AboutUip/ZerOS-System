import {
  createTimeline,
  stagger,
  utils,
  engine,
} from '../../../dist/modules/index.js';

const [$animPlay] = utils.$('#animation-play');
const [$animPause] = utils.$('#animation-pause');
const [$animReverse] = utils.$('#animation-reverse');
const [$animResume] = utils.$('#animation-resume');
const [$animToggle] = utils.$('#animation-alternate');

const [$animReversed] = utils.$('#animation-reversed');

const [$animProgress] = utils.$('#animation-progress');
const [$animationCurrentTime] = utils.$('#animation-currentTime');

const [$engineFramerate] = utils.$('#engine-frameRate');
const [$engineFPS] = utils.$('#engine-fps');

const [$enginePlaybackrate] = utils.$('#engine-playbackRate');
const [engineSpeedEl] = utils.$('#engine-speed');

const [$animFramerate] = utils.$('#animation-frameRate');
const [$animationFPS] = utils.$('#animation-fps');

const [$animPlaybackrate] = utils.$('#animation-playbackRate');
const [$animSpeed] = utils.$('#animation-speed');

const [$animTimeDrift] = utils.$('#animation-time-drift');

const animation = createTimeline({
  loop: true,
  onLoop: self => {
    console.log(self.currentIteration);
  },
  onUpdate: (self) => {
    /** @type {HTMLInputElement} */
    ($animProgress).value = `${self.iterationProgress}`;
    /** @type {HTMLInputElement} */
    ($animationCurrentTime).value = `${self.currentTime}`;
    /** @type {HTMLInputElement} */
    ($animReversed).value = `${self.reversed}`;
  },
})
.add('.square', {
  translateY: [{ to: '-10rem', duration: 300 }, { to: '0rem', ease: 'inOut', duration: 700 }],
  scaleX: [{ to: .8 }, { to: 1, ease: 'inOut' }],
  scaleY: [{ to: 2, duration: 500}, { to: 1, ease: 'inOut', duration: 350 }],
  delay: stagger(100),
  onBegin: () => {
    console.log('BEGAN')
  },
  onComplete: () => {
    console.log('COMPLETE')
  }
});

const startTime = Date.now();

$animPlay.onclick = () => {
  // animation.play();
  animation.reversed = false;
}

$animPause.onclick = () => {
  animation.pause();
}

$animResume.onclick = () => {
  animation.resume();
}

$animReverse.onclick = () => {
  // animation.reverse();
  animation.reversed = true;
}

$animToggle.onclick = () => {
  animation.alternate();
}

$engineFramerate.oninput = () => {
  engine.fps = +/** @type {HTMLInputElement} */($engineFramerate).value;
  /** @type {HTMLInputElement} */
  ($engineFPS).value = `${engine.fps}`;
}

$enginePlaybackrate.oninput = () => {
  engine.speed = +/** @type {HTMLInputElement} */($enginePlaybackrate).value;
  /** @type {HTMLInputElement} */
  (engineSpeedEl).value = `${engine.speed}`;
}

$animFramerate.oninput = () => {
  animation.fps = +/** @type {HTMLInputElement} */($animFramerate).value;
  /** @type {HTMLInputElement} */
  ($animationFPS).value = `${animation.fps}`;
}

$animPlaybackrate.oninput = () => {
  animation.speed = +/** @type {HTMLInputElement} */($animPlaybackrate).value;
  /** @type {HTMLInputElement} */
  ($animSpeed).value = `${animation.speed}`;
}

$animProgress.oninput = v => {
  animation.iterationProgress = v.target.value;
}

setInterval(() => {
  const elapsed = Date.now() - startTime;
  /** @type {HTMLInputElement} */
  ($animTimeDrift).value = (animation.currentTime - elapsed) + 'ms';
}, 1000);
