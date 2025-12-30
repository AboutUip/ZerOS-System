import {
  utils,
  onScroll,
  animate,
} from '../../../../dist/modules/index.js';

const $logs = utils.$('.log');

const log = ($log, text) => {
  const $spans = $log.querySelectorAll('span');
  if ($spans.length > 300) {
    for (let i = 0; i < 200; i++) {
      $log.removeChild($spans[i]);
    }
  }
  const $el = document.createElement('span');
  $el.innerHTML = `${text}<br>`;
  $log.appendChild($el);
  $log.scrollTop = $log.scrollHeight;
}

const scollers = [];

$logs.forEach(($log, i) => {
  scollers.push(onScroll({
    id: 'section ' + i,
    target: `#section-0${i+1}`,
    enter: 'max top',
    leave: 'min bottom',
    sync: 1,
    debug: true,
    onUpdate: self => {
      log($log, self.progress);
    },
    onEnter: self => {
      log($log, `enter #section-0${i+1}`);
    },
    onLeave: self => {
      log($log, `leave #section-0${i+1}`);
    }
  }));
});

// Link a timer / animation / timeline later

const animation = animate('#section-04 h2', {
  scale: 20,
});

scollers[3].link(animation);

// Lazy load example

utils.$('.lazy-load').forEach(($lazy, i) => {

  onScroll({
    target: $lazy,
    repeat: false,
    enter: { target: i * 6 + 'rem', container: 'bottom-=' + 2 + ((i) * 2) + 'rem'},
    onEnter: self => {
      /** @type {HTMLMediaElement} */(self.target).src = self.target.dataset.src;
    },
    debug: true
  })
})

