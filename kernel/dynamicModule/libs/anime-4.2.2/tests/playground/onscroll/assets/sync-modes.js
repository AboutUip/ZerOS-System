import {
  utils,
  animate,
  onScroll,
  stagger,
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

animate('#section-01 .card', {
  rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
  transformOrigin: ['75% 75%', '75% 75%'],
  ease: 'inOut(2)',
  autoplay: onScroll({
    enter: 'max-=100 top',
    leave: 'min+=100 bottom',
    sync: .5,
    debug: true,
    onEnter: () => log($logs[0], 'onEnter'),
    onLeave: () => log($logs[0], 'onLeave'),
    onUpdate: self => log($logs[0], 'onUpdate ' + self.linked.progress.toFixed(3)),
    onEnterForward: () => { log($logs[0], 'onEnterForward'); },
    onLeaveForward: () => { log($logs[0], 'onLeaveForward'); },
    onEnterBackward: () => { log($logs[0], 'onEnterBackward'); },
    onLeaveBackward: () => { log($logs[0], 'onLeaveBackward'); },
    onSyncComplete: () => log($logs[0], 'onSyncComplete'),
  }),
});

animate('#section-02 .card', {
  rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
  transformOrigin: ['75% 75%', '75% 75%'],
  ease: 'inOut(2)',
  loop: true,
  alternate: true,
  autoplay: onScroll({
    enter: 'max-=100 top',
    leave: 'min+=100 bottom',
    sync: 'play pause',
    debug: true,
    onEnter: () => log($logs[1], 'onEnter'),
    onLeave: () => log($logs[1], 'onLeave'),
    onUpdate: self => log($logs[1], 'onUpdate ' + self.progress.toFixed(3)),
    onEnterForward: () => { log($logs[1], 'onEnterForward'); },
    onLeaveForward: () => { log($logs[1], 'onLeaveForward'); },
    onEnterBackward: () => { log($logs[1], 'onEnterBackward'); },
    onLeaveBackward: () => { log($logs[1], 'onLeaveBackward'); },
    onSyncComplete: () => log($logs[1], 'onSyncComplete'),
  }),
});

animate('#section-03 .card', {
  rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
  transformOrigin: ['75% 75%', '75% 75%'],
  ease: 'inOut(2)',
  autoplay: onScroll({
    enter: 'max-=100 top',
    leave: 'min+=100 bottom',
    sync: 'play alternate reverse reset',
    debug: true,
    onEnter: () => log($logs[2], 'onEnter'),
    onLeave: () => log($logs[2], 'onLeave'),
    onUpdate: self => log($logs[2], 'onUpdate ' + self.progress.toFixed(3)),
    onEnterForward: () => { log($logs[2], 'onEnterForward'); },
    onLeaveForward: () => { log($logs[2], 'onLeaveForward'); },
    onEnterBackward: () => { log($logs[2], 'onEnterBackward'); },
    onLeaveBackward: () => { log($logs[2], 'onLeaveBackward'); },
    onSyncComplete: () => log($logs[2], 'onSyncComplete'),
  }),
});

animate('#section-04 .card', {
  rotate: [stagger(utils.random(-1, 1, 2)), stagger(15)],
  transformOrigin: ['75% 75%', '75% 75%'],
  ease: 'linear',
  autoplay: onScroll({
    enter: 'max-=100 top',
    leave: 'min+=100 bottom',
    sync: 'inOutExpo',
    debug: true,
    onEnter: () => log($logs[3], 'onEnter'),
    onLeave: () => log($logs[3], 'onLeave'),
    onUpdate: self => log($logs[3], 'onUpdate ' + self.linked.progress.toFixed(3)),
    onEnterForward: () => { log($logs[3], 'onEnterForward'); },
    onLeaveForward: () => { log($logs[3], 'onLeaveForward'); },
    onEnterBackward: () => { log($logs[3], 'onEnterBackward'); },
    onLeaveBackward: () => { log($logs[3], 'onLeaveBackward'); },
    onSyncComplete: () => log($logs[3], 'onSyncComplete'),
  }),
});
