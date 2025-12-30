import {
  animate,
  createTimeline,
  createScope,
  stagger,
  splitText,
  utils,
  Scope,
} from '../../../dist/modules/index.js';

let split;

const form = document.getElementById('splitForm');
const $revert = document.getElementById('revert');
const $split = document.getElementById('split');

const config = {
  split: {
    lines: false,
    words: false,
    chars: false,
    includeSpaces: false,
    accessible: false,
    debug: false
  },
  animation: {
    lines: false,
    words: false,
    chars: false,
  }
};

const animateSplit = (targets, type) => {
  const param = config.split[type];
  const anim = config.animation[type];
  const dir = param.clone;
  const randomStagger = anim.stagger === 'random';
  return animate(targets, {
    x: dir === 'left' ? '100%' : dir === 'right' ? '-100%' : 0,
    y: dir === 'top' ? '100%' : dir === 'bottom' ? '-100%' : !dir ? '-100%' :  0,
    loop: true,
    alternate: true,
    duration: anim.duration,
    delay: stagger(randomStagger ? 10 : anim.stagger, { from: randomStagger ? 'random' : 0 }),
  });
}

function updateSplitConfig() {
  const data = new FormData(/** @type {HTMLFormElement} */(document.getElementById('splitForm')));

  ['lines', 'words', 'chars'].forEach(type => {
    config.split[type] = false;
    if (data.has(type)) {
      const wrap = data.get(`${type}-wrap`);
      const clone = data.get(`${type}-clone`);
      const animate = data.get(`${type}-animate`);
      config.split[type] = {
        wrap: wrap === 'false' ? false : wrap,
        clone: clone === 'false' ? false : clone
      };
      config.animation[type] = !+animate ? false : {
        duration: +animate,
        stagger: data.get(`${type}-stagger`)
      };
    }
  });

  config.split.includeSpaces = data.has('includeSpaces');
  config.split.accessible = data.has('accessible');
  config.split.debug = data.has('debug');

  if (split) split.revert();

  split = splitText('article', { ...config.split })
  .addEffect(self => config.animation.lines && self.lines.length && animateSplit(self.lines, 'lines'))
  .addEffect(self => config.animation.words && self.words.length && animateSplit(self.words, 'words'))
  .addEffect(self => config.animation.chars && self.chars.length && animateSplit(self.chars, 'chars'))
  $revert.removeAttribute('disabled');
}

document.fonts.ready.then(() => {
  document.body.classList.add('is-ready');
  ['lines', 'words', 'chars'].forEach(type => {
    const checkbox = /** @type {HTMLInputElement} */(document.getElementById(type));
    const fieldset = /** @type {HTMLInputElement} */(document.getElementById(`${type}-options`));
    checkbox.addEventListener('change', () => fieldset.disabled = !checkbox.checked);
    fieldset.disabled = !checkbox.checked;
  });
  form.addEventListener('change', updateSplitConfig);
  $revert.addEventListener('click', () => {split && split.revert(); $revert.setAttribute('disabled', 'false'); });
  $split.addEventListener('click', updateSplitConfig);
  updateSplitConfig();
});
