import { animate, createTimeline, eases, createSpring, utils, stagger } from '../../dist/modules/index.js';

function bindInputsToObject(name, obj, onChange = () => {}) {
  const $bindedInputs = document.querySelectorAll(`[data-${ name }]`);
  $bindedInputs.forEach($input => $input.addEventListener('input', event => {
    const prop = event.currentTarget.dataset[name];
    const value = event.currentTarget.value;
    const $sibling = document.querySelectorAll(`[data-${ name }="${ prop }"]`);
    $sibling.forEach($bind => $bind.value = value);
    obj[prop] = value;
    onChange(obj, prop, value);
  }));
  return $bindedInputs;
}

// SVG curve stuff

function createSvgCurve(strokeWidth = 1) {
  const $svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const $curve = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  $svg.setAttribute('viewBox', '0 0 100 100');
  $curve.setAttribute('stroke-width', strokeWidth);
  $curve.setAttribute('points', '0 100 50 50 100 0');
  $curve.setAttribute('stroke-linecap', 'round');
  $curve.setAttribute('stroke-linejoin', 'round');
  $curve.setAttribute('fill', 'none');
  $curve.setAttribute('fill-rule', 'evenodd');
  $svg.appendChild($curve);
  return $svg;
}

function createCurvePoints(maxPoints = 100) {
  const points = [];
  for (let i = 0; i < maxPoints + 1; i++) {
    points.push({
      x: utils.round((i / maxPoints) * 100, 10),
      y: utils.round(100 - ((i / maxPoints) * 100), 10),
    });
  }
  return points;
}

const $easesEditor = document.querySelector('#eases-editor');
const $mainCurve = document.querySelector('#ease-curve');
const $easeName = document.querySelector('#ease-name');
const $easeList = document.querySelector('#eases-list');
const mainCurvePoints = createCurvePoints(400);
const buttonCurvePoints = createCurvePoints(100);
const buttons = [];

utils.set($mainCurve, { points: coordsToPoints(mainCurvePoints) });

const easesLookup = { createSpring, ...eases };

const easesList = {
  in: [{ name: 'power', value: 1.675, min: 1, max: 10, step: .1 }],
  out: [{ name: 'power', value: 1.675, min: 1, max: 10, step: .1 }],
  inOut: [{ name: 'power', value: 1.675, min: 1, max: 10, step: .1 }],
  inSine: null,
  outSine: null,
  inOutSine: null,
  inQuad: null,
  outQuad: null,
  inOutQuad: null,
  inCubic: null,
  outCubic: null,
  inOutCubic: null,
  inQuart: null,
  outQuart: null,
  inOutQuart: null,
  inQuint: null,
  outQuint: null,
  inOutQuint: null,
  inExpo: null,
  outExpo: null,
  inOutExpo: null,
  inCirc: null,
  outCirc: null,
  inOutCirc: null,
  inBack: [{ name: 'overshoot', value: 1.70158, min: 0, max: 5, step: .01 }],
  outBack: [{ name: 'overshoot', value: 1.70158, min: 0, max: 5, step: .01 }],
  inOutBack: [{ name: 'overshoot', value: 1.70158, min: 0, max: 5, step: .01 }],
  inBounce: null,
  outBounce: null,
  inOutBounce: null,
  inElastic: [
    { name: 'amplitude', value: 1, min: 1, max: 3, step: .01 },
    { name: 'period', value: .3, min: 0, max: 2, step: .01 }
  ],
  outElastic: [
    { name: 'amplitude', value: 1, min: 1, max: 3, step: .01 },
    { name: 'period', value: .3, min: 0, max: 2, step: .01 }
  ],
  inOutElastic: [
    { name: 'amplitude', value: 1, min: 1, max: 3, step: .01 },
    { name: 'period', value: .3, min: 0, max: 2, step: .01 }
  ],
  createSpring: [
    { name: 'mass', value: 1, min: 0, max: 10, step: .01 },
    { name: 'stiffness', value: 100, min: 1, max: 1000, step: 1 },
    { name: 'damping', value: 10, min: .1, max: 50, step: .1 },
    { name: 'velocity', value: 0, min: 0, max: 100, step: .1 },
  ],
  steps: [
    { name: 'steps', value: 10, min: 0, max: 50, step: 1 },
    { name: 'jumpterm', value: 0, min: 0, max: 1, step: 1 }
  ],
  irregular: [
    { name: 'steps', value: 10, min: 0, max: 50, step: 1 },
    { name: 'randomness', value: 1, min: 0, max: 4, step: .001 },
  ],
  cubicBezier: [
    { name: 'x1', value: 0.2, min: 0, max: 1, step: .01 },
    { name: 'y1', value: 2.0, min: -2, max: 3, step: .01 },
    { name: 'x2', value: 0.6, min: 0, max: 1, step: .01 },
    { name: 'y2', value: 0.4, min: -2, max: 3, step: .01 },
  ],
  linear: [
    { name: 'p1', value: 0.00, min: -.5, max: 1.5, step: .01 },
    { name: 'p2', value: 0.50, min: -.5, max: 1.5, step: .01 },
    { name: 'p3', value: 1.00, min: -.5, max: 1.5, step: .01 },
  ],
}

function createElement(tag, className = null, innerHTML = null) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

function coordsToPoints(mainCurvePoints) {
  let points = '';
  mainCurvePoints.forEach(p => points += `${p.x} ${p.y} `);
  return points;
}

const parameters = {
  ease: eases.out,
  name: 'out',
  computedEasing: null,
  easeDuration: 450,
  transitionEasing: 'inOut(3)',
  p1: null,
  p2: null,
  p3: null,
  p4: null,
}

function animateEasing() {
  const totalDuration = 1250;
  utils.set('.axis-x:not(:first-child)', { opacity: 0 });
  createTimeline({
    defaults: {
      duration: totalDuration,
      ease: 'linear',
    },
  })
  .add('.axis-y', {
    translateX: ['calc(var,(--unit) * 0)', 'calc(var(--unit) *  40)'],
    onUpdate: self => self.targets[0].dataset.value = utils.round(self.progress, 1),
   }, 0)
  .add('.axis-x:first-child', {
    translateY: ['calc(var(--unit) * 0)', 'calc(var(--unit) * -40)'],
    ease: parameters.computedEasing,
  }, 0)
  .set('.axis-x:not(:first-child)', {
    opacity: [0, .2],
  }, stagger([0, totalDuration], { start: 0 }))
}

function updateCurve($curve, points, ease, params, duration = parameters.easeDuration) {
  const parsedEasing = params ? ease(...params) : ease;
  parameters.computedEasing = parsedEasing;
  utils.set(points, { y: stagger([100, 0], { ease: parsedEasing }) });
  animate($curve, {
    points: coordsToPoints(points),
    duration,
    ease: parameters.transitionEasing,
    composition: duration ? 'add' : 'none',
    modifier: v => utils.round(v, 2)
  });
}

function updateName(name, ease, params) {
  let easeName = name;
  if (params) {
    easeName += '(';
    params.forEach((p, i) => {
      easeName += p + (i === params.length - 1 ? ')' : ', ');
    });
  }
  $easeName.value = easeName;
}

function updateParameters(state) {
  let params;
  for (let p in state) {
    if (p === 'p1' || p === 'p2' || p === 'p3' || p === 'p4') {
      const pVal = state[p];
      if (pVal !== null) {
        if (!params) params = [];
        params.push(+pVal);
      }
    }
  }
  const ease = state.name === 'spring' ? params ? state.ease(...params).ease : state.ease().ease : state.ease
  updateCurve($mainCurve, mainCurvePoints, ease, state.name === 'spring' ? undefined : params);
  updateName(state.name, ease, params);

  animate('.axis-x:not(:first-child)', {
    translateY: stagger([0, -40], {
      ease: parameters.computedEasing,
      modifier: v => `calc(var(--unit) * ${v}`,
    }),
    duration: parameters.easeDuration,
    ease: parameters.transitionEasing,
    composition: 'add',
  });
}

const $parameters = bindInputsToObject('parameters', parameters, updateParameters);

function selectEase(name) {
  const easeFunction = easesLookup[name];
  const easeParams = easesList[name];
  parameters.ease = easeFunction;
  parameters.name = name;
  parameters.p1 = null;
  parameters.p2 = null;
  parameters.p3 = null;
  parameters.p4 = null;
  const $legends = document.querySelectorAll('.parameter-legend');
  $parameters.forEach($el => $el.disabled = true);
  $legends.forEach(($el, i) => {$el.disabled = true; $el.textContent = '--'});
  if (easeParams) {
    easeParams.forEach((p, i) => {
      const propName = 'p' + (i + 1);
      const $ps = document.querySelectorAll(`[data-parameters=${ propName }]`);
      $ps.forEach($p => {
        $p.disabled = false;
        $p.min = p.min;
        $p.max = p.max;
        $p.step = p.step;
        $p.value = p.value;
      });
      $legends[i].innerHTML = '&#9881;&#xFE0E; ' + p.name;
      parameters[propName] = p.value;
    });
  }
  const $button = document.querySelector('.ease-' + name);
  buttons.forEach($el => $el.classList.remove('is-active'));
  $button.classList.add('is-active');
  utils.set('.axis-x:not(:first-child)', { opacity: 0 });
  updateParameters(parameters);
}

function createEaseButton(name, ease, hasParams) {
  const $button = createElement('button', 'ease-button');
  const $name = createElement('span', 'ease-name', name);
  const $svgCurve = createSvgCurve(2);
  updateCurve($svgCurve.querySelector('polyline'), buttonCurvePoints, ease, null, 0);
  $button.classList.add('ease-' + name);
  $button.appendChild($svgCurve);
  $button.appendChild($name);
  if (hasParams) {
    $button.appendChild(createElement('span', 'ease-config', '&#9881;&#xFE0E;'));
  }
  $button.onclick = () => {
    if (name !== parameters.name) {
      selectEase(name);
    }
    if (window.innerWidth < 639) {
      window.scroll({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    }
    animateEasing();

  }
  return $button;
}

for (let easeName in easesList) {
  const params = easesList[easeName];
  let ease = easesLookup[easeName];
  if (easeName === 'spring') {
    ease = ease().solver;
  } else if (easeName === 'cubicBezier') {
    ease = ease(0.2, 2.0, 0.6, 0.4);
  } else if (params) {
    ease = ease();
  }
  const $button = createEaseButton(easeName, ease, params);
  $easeList.appendChild($button);
  buttons.push($button);
}

selectEase('out');
animateEasing();

$easesEditor.onclick = animateEasing;
